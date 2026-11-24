build:
	@echo ⌛ building...
	yarn run build
	@echo done

.PHONY: client
client:
	@echo ⌛ building client...
	yarn workspace @ki-cl/client run build
	@echo done

codegen:
	@echo ⌛ generating...
	yarn run codegen
	@echo done

install:
	@echo ⌛ installing...
	yarn
	@echo done

lint:
	@echo ⌛ linting...
	yarn run lint
	@echo done

omr.install:
	@echo ⌛ installing the sheet reader...
	python3.12 -m venv Omr/.venv
	Omr/.venv/bin/pip install -q -r Omr/requirements.txt
	Omr/.venv/bin/homr --init
	@echo done

omr.run:
	Omr/.venv/bin/python Omr/server.py

run:
	@echo ⌛ running development...
	yarn run development

run.production:
	@echo ⌛ running production...
	yarn run production

start:
	@echo ⌛ starting...
	yarn install && yarn run start
	@echo ✅ done

REGISTRY ?= ki-cl-registry

# Writes Codegen/schema.graphql, the gateway's public schema, from the services
# published to REGISTRY (production by default). Run it, then `make codegen`,
# when a service publishes a field the client needs.
schema:
	@rm -rf .registry && mkdir -p .registry/services
	@gcloud storage cp -q "gs://$(REGISTRY)/services/*.json" .registry/services/
	npx tsx Server/Scripts/schema.ts ./.registry

CORE ?= ../Ki.CL-core

# Points the local gateway at a local core on port 3110: run core with
# `PORT=3110 make run`, then this, then `make run` here.
registry.local:
	@mkdir -p .registry-local/services
	@cd $(CORE) && npx tsx Server/Scripts/registry.ts record http://localhost:3110/api > $(CURDIR)/.registry-local/services/core.json
	@echo "wrote .registry-local/services/core.json"
