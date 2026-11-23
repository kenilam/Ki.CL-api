# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

A Yarn 4 workspace repo with three workspaces: `Server` (the gateway), `Codegen` and `Client`. Node >=24.

```bash
make run              # codegen + build Client + start the gateway (tsx watch)
make registry.local   # point the local gateway at a local core on port 3110 (run core with PORT=3110 make run)
make schema           # write Codegen/schema.graphql from the production registry (REGISTRY=ki-cl-registry-dev for dev)
yarn codegen          # regenerate Client/src/operations.graphql and Client/src/generated from Codegen/schema.graphql
yarn build            # codegen + tsc --noEmit
yarn lint             # oxlint
```

## What this is

Ki.CL-api is the gateway in front of the site's GraphQL services, and it serves the `api` federation remote, the browser client, at `/client`. It runs no resolvers. The services own their schemas, data and checks; [Ki.CL-core](https://github.com/kenilam/Ki.CL-core) holds everything that hasn't moved into a service of its own.

- `Server/gateway.ts` runs Hive Gateway at `/api`, over HTTP and WebSocket. Every 30 seconds it reads the service records from the registry (`REGISTRY`: a bucket name, or a directory locally) and composes them with `@theguild/federation-composition` (`Server/registry.ts`). A record that won't parse or compose is logged, and the last good supergraph stays in place. A service never needs a gateway release.
- The visitor's `cookie`, `accept-language`, `origin`, `authorization` and `x-turnstile-token` go to every service. `set-cookie` comes back from every service, and `content-language` from core.
- Subscriptions reach a service over WebSocket with the visitor's cookie in `connectionParams`, which is one upstream socket per visitor.
- A service's bare 401 becomes an `UNAUTHENTICATED` GraphQL error, so the client sees a code rather than an unexpected error.
- Services only take internal traffic and require an invoker. On Cloud Run, `Server/invoker.ts` mints an ID token for the shared audience `ki-cl-subgraphs` and every call carries it in `X-Serverless-Authorization`, which is the gateway proving who it is to Cloud Run. The visitor's own credentials stay in their cookie.
- `/api/session` and `/assets/*` pass straight through to core (`Server/passthrough.ts`).
- Hive builds its schema on the first request, so `Server/index.ts` sends itself one query before it listens; otherwise a subscription arriving first fails.

## Client

`Client/` is `@ki-cl/client`, a React 19 and Apollo Client package built with Vite and exposed through Module Federation. `./client` exports `Provider`, `getClient`, the typed documents and Apollo's hooks; `./provider` keeps the old names (`KiclProvider`, `getKiclClient`) for one release and then goes.

The documents are generated from `Codegen/schema.graphql`, the gateway's public schema, which is committed so CI can build without the registry. When a service publishes a field the client needs, the service releases first, then `make schema` and `yarn codegen` here, then the host.

## Omr

`Omr/` is Kinetic Light's sheet reader, a separate Python service around homr (AGPL-3.0, so it stays its own program), deployed by its own triggers. Core calls it at `KINETIC_LIGHT_OMR_URL`. It moves with Kinetic Light.

## Writing

Comments, commit messages and docs are read by people. Keep them plain: say what and why in normal sentences, no flourishes, no rhythm tricks, no narrating what the code already shows. If it would sound odd said out loud to a teammate, rewrite it.
