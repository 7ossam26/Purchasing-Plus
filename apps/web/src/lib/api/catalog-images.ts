import type { ImageCrop } from '@purchasing-plus/shared';
import { ar } from '@purchasing-plus/shared/i18n/ar';

import type { CatalogImage } from './catalog.js';
import { api, ApiError, apiResponse } from './client.js';

const path = (id: number) => `/catalog/items/${id}/images`;
export const catalogImagesApi = {
  async preview(id: number, file: File, signal: AbortSignal) {
    const body = new FormData();
    body.append('file', file);
    return (
      await apiResponse(
        path(id) + '/preview',
        { method: 'POST', body, signal },
        'image/webp',
      )
    ).blob();
  },
  upload(
    id: number,
    file: File,
    crop: ImageCrop | null,
    onProgress: (percent: number) => void,
  ) {
    return new Promise<CatalogImage[]>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', '/api/v1' + path(id));
      request.withCredentials = true;
      request.responseType = 'json';
      request.upload.onprogress = (event) => {
        if (event.lengthComputable)
          onProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          resolve(request.response);
          return;
        }
        const body = request.response;
        reject(
          new ApiError(
            request.status,
            body?.error ?? 'UPLOAD_ERROR',
            body?.message ?? ar.common.fallbackError,
            body?.fix,
          ),
        );
      };
      request.onerror = () =>
        reject(
          new ApiError(
            0,
            'NETWORK_ERROR',
            ar.common.networkError,
            ar.common.networkFix,
          ),
        );
      const body = new FormData();
      body.append('file', file);
      if (crop) body.append('crop', JSON.stringify(crop));
      request.send(body);
    });
  },
  crop: (id: number, image: number, crop: ImageCrop | null) =>
    api<CatalogImage[]>(path(id) + '/' + image + '/crop', {
      method: 'PATCH',
      body: { crop },
    }),
  order: (id: number, ids: number[]) =>
    api<CatalogImage[]>(path(id) + '/order', { method: 'PUT', body: { ids } }),
  cover: (id: number, image: number) =>
    api<CatalogImage[]>(path(id) + '/' + image + '/cover', { method: 'PUT' }),
  remove: (id: number, image: number) =>
    api<CatalogImage[]>(path(id) + '/' + image, { method: 'DELETE' }),
};
