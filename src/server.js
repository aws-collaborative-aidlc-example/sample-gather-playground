import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createBooking, listBookings } from './bookings.js';
import { createStore } from './store.js';

function allowMethods(methods) {
  return (request, response, next) => {
    if (methods.includes(request.method)) return next();
    response.set('Allow', methods.join(', '));
    response.status(405).json({ error: 'Method not allowed.' });
  };
}

export function createAppServer({ store = createStore() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.enable('case sensitive routing');
  app.enable('strict routing');
  app.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  app.route('/api/rooms')
    .all(allowMethods(['GET']))
    .get((request, response) => response.json(store.rooms));

  app.route('/api/bookings')
    .all(allowMethods(['GET', 'POST']))
    .get((request, response) => {
      response.json(listBookings(store, request.query.roomId, request.query.date));
    })
    .post(
      (request, response, next) => {
        if (request.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
          return response.status(415).json({ error: 'Use Content-Type: application/json.' });
        }
        next();
      },
      express.json({ limit: '16kb', strict: false }),
      (request, response) => {
        response.status(201).json(createBooking(store, request.body));
      }
    );

  app.use((request, response) => {
    response.status(404).json({ error: 'API endpoint not found.' });
  });
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    const status = error.status ?? 500;
    let message = error.message;
    if (error.type === 'entity.parse.failed') message = 'Request body must be valid JSON.';
    if (error.type === 'entity.too.large') message = 'Request body is too large.';
    if (status >= 500) {
      console.error(error);
      message = 'Something went wrong.';
    }
    response.status(status).json({ error: message });
  });
  return createServer(app);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createAppServer();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  server.listen(port, host, () => console.log(`Gather API is running at http://${host}:${port}`));
}
