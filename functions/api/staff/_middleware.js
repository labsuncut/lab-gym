// Every /api/staff/* route needs a logged-in staff member, except login itself.
import { handle, sameOrigin, HttpError } from '../../_lib/http.js';
import { isStaff } from '../../_lib/auth.js';

export const onRequest = handle(async ({ request, env, next }) => {
  sameOrigin(request);
  const path = new URL(request.url).pathname;
  if (path !== '/api/staff/login' && !(await isStaff(request, env))) {
    throw new HttpError(401, 'Please log in.');
  }
  return next();
});
