import {
  emptyInput,
  imageCropUpdate,
  imageOrder,
  pathId,
} from '@purchasing-plus/shared';
import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';

import { imagePreview, prepareImage, readImageUpload } from './pipeline.js';
import { assertItem } from './repo.js';
import {
  deleteImage,
  reorderImages,
  setCover,
  updateCrop,
  uploadImage,
} from './service.js';

export const catalogImages = Router();
catalogImages.post(
  '/items/:id/images/preview',
  ...endpoint(
    ['catalog.edit'],
    ({ req, tx }) => assertItem(tx, pathId.parse(req.params.id)),
    200,
    undefined,
    undefined,
    true,
    async (_item, response) => {
      const preview = await imagePreview(
        (await readImageUpload(response.req)).file,
      );
      response.type('image/webp').send(preview);
    },
  ),
);
catalogImages.post(
  '/items/:id/images',
  ...endpoint(
    ['catalog.edit'],
    (ctx) =>
      uploadImage(
        ctx,
        pathId.parse(ctx.req.params.id),
        ctx.req.res!.locals.image,
      ),
    201,
    undefined,
    prepareImage,
  ),
);
catalogImages.patch(
  '/items/:id/images/:imageId/crop',
  ...endpoint(['catalog.edit'], (ctx) =>
    updateCrop(
      ctx,
      pathId.parse(ctx.req.params.id),
      pathId.parse(ctx.req.params.imageId),
      imageCropUpdate.parse(ctx.req.body).crop,
    ),
  ),
);
catalogImages.put(
  '/items/:id/images/order',
  ...endpoint(['catalog.edit'], (ctx) =>
    reorderImages(
      ctx,
      pathId.parse(ctx.req.params.id),
      imageOrder.parse(ctx.req.body).ids,
    ),
  ),
);
catalogImages.put(
  '/items/:id/images/:imageId/cover',
  ...endpoint(['catalog.edit'], (ctx) => {
    emptyInput.parse(ctx.req.body ?? {});
    return setCover(
      ctx,
      pathId.parse(ctx.req.params.id),
      pathId.parse(ctx.req.params.imageId),
    );
  }),
);
catalogImages.delete(
  '/items/:id/images/:imageId',
  ...endpoint(['catalog.edit'], (ctx) => {
    emptyInput.parse(ctx.req.body ?? {});
    return deleteImage(
      ctx,
      pathId.parse(ctx.req.params.id),
      pathId.parse(ctx.req.params.imageId),
    );
  }),
);
