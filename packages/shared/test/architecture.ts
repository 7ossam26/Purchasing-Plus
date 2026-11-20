import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

export interface Finding {
  file: string;
  line: number;
  detail: string;
}

const rolePattern = /(?:\brole\.name\b|\broleName\b|\broleId\s*===|\.role\?\.name\b)/g;
const physicalClassPattern = /(?:^|\s)(?:[\w-]+:)*(?:ml-|mr-|pl-|pr-|left-|right-|text-left\b|text-right\b|rounded-l(?:\b|-)|rounded-r(?:\b|-)|border-l(?:\b|-)|border-r(?:\b|-))[^\s'"`}]*/g;

function source(file: string, content: string): ts.SourceFile {
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function finding(file: string, fileSource: ts.SourceFile, position: number, detail: string): Finding {
  return { file, line: fileSource.getLineAndCharacterOfPosition(position).line + 1, detail };
}

export function findRoleLogic(file: string, content: string): Finding[] {
  const fileSource = source(file, content);
  const results: Finding[] = [];
  function visit(node: ts.Node): void {
    const condition =
      ts.isIfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isSwitchStatement(node)
        ? node.expression
        : ts.isConditionalExpression(node)
          ? node.condition
          : ts.isForStatement(node)
            ? node.condition
            : undefined;
    if (condition) {
      const text = condition.getText(fileSource);
      for (const match of text.matchAll(rolePattern)) {
        results.push(finding(file, fileSource, condition.getStart(fileSource) + match.index, match[0]));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(fileSource);
  return results;
}

export function findPhysicalClasses(file: string, content: string): Finding[] {
  const fileSource = source(file, content);
  const results: Finding[] = [];
  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      for (const match of node.text.matchAll(physicalClassPattern)) {
        results.push(finding(file, fileSource, node.getStart(fileSource) + 1 + match.index, match[0].trim()));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(fileSource);
  return results;
}

export function findForbiddenSharedImports(file: string, content: string): Finding[] {
  const fileSource = source(file, content);
  const results: Finding[] = [];
  function check(specifier: ts.StringLiteral): void {
    const value = specifier.text;
    if (/(?:^|\/)apps\//.test(value) || value === 'node:fs' || value.startsWith('node:fs/') || value === 'node:net' || value.startsWith('node:net/') || value.startsWith('@prisma/')) {
      results.push(finding(file, fileSource, specifier.getStart(fileSource), value));
    }
  }
  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      check(node.moduleSpecifier);
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]!)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        check(node.arguments[0] as ts.StringLiteral);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(fileSource);
  return results;
}

export function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /(?:^|\.)test\.tsx?$/.test(entry.name) || /(?:^|\.)seed\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

export function checkFiles(files: string[], check: (file: string, content: string) => Finding[]): Finding[] {
  return files.flatMap((file) => check(file, readFileSync(file, 'utf8')));
}
