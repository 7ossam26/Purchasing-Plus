import { emptyInput, imageOrder, pathId } from '@purchasing-plus/shared';
import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';

import { prepareImage } from './pipeline.js';
import {
  deleteImage,
  reorderImages,
  setCover,
  uploadImage,
} from './service.js';

export const catalogImages = Router();
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
