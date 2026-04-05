# Heimdall backend

Fastify + TypeScript. Data lives in `data/store.json` (created by `npm run seed`).

## Commands

```bash
npm install
npm run seed
npm run dev
```

## Auth (demo)

- Admin routes: header `X-Admin-Token: demo-admin`
- `POST /auth/demo` returns the first seeded user for mobile

## Env

See `.env.example`. `DATABASE_PATH` points to the JSON store file.
