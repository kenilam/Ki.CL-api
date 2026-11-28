# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

How code is written follows "Code" in `Ki.CL/CLAUDE.md`.

## Commands

A Yarn 4 workspace repo with three workspaces: `Server` (the gateway), `Codegen` and `Client`. Node >=24.

```bash
make run              # codegen + build Client + start the gateway (tsx watch)
make registry.local   # write a local registry record for a local core on port 3110 (run core with PORT=3110 make run)
make schema           # write Codegen/schema.graphql from the production registry (REGISTRY=ki-cl-registry-dev for dev)
yarn codegen          # regenerate Client/src/operations.graphql and Client/src/generated from Codegen/schema.graphql
yarn build            # codegen + tsc --noEmit
yarn lint             # oxlint
```

## What this is

Ki.CL-api is the gateway in front of the site's GraphQL services, and it serves the `api` federation remote, the browser client, at `/client`. It runs no resolvers, and it does every check, so the services check nothing. The services own their schemas and data; [Ki.CL-core](https://github.com/kenilam/Ki.CL-core) holds everything that hasn't moved into a service of its own.

- `Server/gateway.ts` runs Hive Gateway at `/api`, over HTTP and WebSocket. Every 30 seconds it reads the service records from the registry (`REGISTRY`: a bucket name, or a directory locally) and composes them with `@theguild/federation-composition` (`Server/registry.ts`). A record that won't parse or compose is logged, and the last good supergraph stays in place. A service never needs a gateway release.
- The visitor's `cookie`, `accept-language`, `origin` and `authorization` go to every service, with any cookies the gateway issued for the request in place of the old ones. `content-language` comes back from Ki.CL-i18n, the service that answers with the site's words.
- Subscriptions reach a service over WebSocket with the visitor's cookie in `connectionParams`, which is one upstream socket per visitor.
- Every HTTP request first passes `Server/admission.ts`, in an `onParams` hook, unless every root field it asks for is in `WHITE_LIST_OPERATION` (`i18nTranslations`, which the host loads before its first page):
  - A visitor with no live refresh token gets a new anonymous token set after a Turnstile check (`Server/turnstile.ts`), stored in `sessions` (`Server/sessions.ts`) and sent on to the service in the cookie. Without a pass the answer is `CAPTCHA_REQUIRED`. Turnstile is checked only here, because Cloudflare accepts each token once.
  - When the refresh token is gone and the readable `aud` cookie says `user`, the answer is `UNAUTHORIZED` and the cookies are removed. `aud` lasts 400 days for this reason.
  - An access token with a bad signature gets `UNAUTHORIZED` and removes the cookies.
- The access token is verified with `JWT_SIGNING_KEY` (`Server/tokens.ts`), the key core signs with. Every root field needs a live one unless its service marks it `@public`; a missing or expired one answers `EXPIRED`, which the client renews with `refreshToken`. Hive's `genericAuth` applies the marks, and only on root fields; the fields under them follow their root. The same check runs on subscriptions, from the upgrade request's cookie.
- Every operation's name starts with `kicl_`, or it answers `BAD_REQUEST`.
- A field that changes the session sends `authorization` in its response's `extensions`: a token set, or `revoke: true`. The gateway sets or removes the cookies from it and removes it from the response. Only cookies the gateway issued or received during a request are set on its response, so a slow response can't put back tokens a renewal replaced. The gateway is the only cookie writer; `set-cookie` from a service is still passed on until core stops sending it.
- A service's bare 401 becomes an `UNAUTHENTICATED` GraphQL error, so the client sees a code rather than an unexpected error.
- Services only take internal traffic and require an invoker. On Cloud Run, `Server/invoker.ts` mints an ID token for the shared audience `ki-cl-subgraphs` and every call carries it in `X-Serverless-Authorization`, which is the gateway proving who it is to Cloud Run. The visitor's own credentials stay in their cookie.
- `/api/session` runs `Server/admission.ts` for clients that don't use GraphQL and answers `{ changed }`, or `{ error, code }` with 401 or 403. `/assets/*` passes straight through to core (`Server/passthrough.ts`).
- `cloudbuild.yaml` builds and deploys the gateway, for the `ki-cl-api-develop` and `ki-cl-api-main` triggers. It stops before deploying if the service grants `allUsers` or `allAuthenticatedUsers`, since only the host may reach the gateway.
- Hive builds its schema on the first request, so `Server/index.ts` sends itself one query before it listens; otherwise a subscription arriving first fails.

## Client

`Client/` is `@ki-cl/client`, a React 19 and Apollo Client package built with Vite and exposed through Module Federation. `./client` exports `Provider`, `getClient`, the typed documents and Apollo's hooks.

The documents are generated from `Codegen/schema.graphql`, the gateway's public schema, which is committed so CI can build without the registry. When a service publishes a field the client needs, the service releases first, then `make schema` and `yarn codegen` here, then the host.

## Omr

`Omr/` is Kinetic Light's sheet reader, a separate Python service around homr (AGPL-3.0, so it stays its own program), deployed by its own triggers from `Omr/cloudbuild.yaml` when a file under `Omr/` changes. Only core may call it, so the build stops before deploying if the service grants `allUsers` or `allAuthenticatedUsers`. Core calls it at `KINETIC_LIGHT_OMR_URL`. It moves with Kinetic Light.

## Writing

Comments, commit messages and docs are read by people. Keep them plain: say what and why in normal sentences, no flourishes, no rhythm tricks, no narrating what the code already shows. If it would sound odd said out loud to a teammate, rewrite it.
