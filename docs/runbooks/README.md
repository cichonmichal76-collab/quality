# Runbooks

This directory contains practical operating procedures for day-to-day work in the ServiceTrace repository.

The goal is to make common engineering tasks repeatable without reconstructing steps from multiple README files or chat history.

## Available runbooks

- [Local development](./local-development.md)
- [Database migrations](./database-migrations.md)
- [Testing and CI](./testing-and-ci.md)
- [Publish changes to GitHub](./publish-to-github.md)

## Suggested reading order

1. start with [Local development](./local-development.md)
2. then read [Database migrations](./database-migrations.md)
3. use [Testing and CI](./testing-and-ci.md) before every push
4. finish with [Publish changes to GitHub](./publish-to-github.md) when shipping work

## Scope notes

- runbooks describe the current backend-first MVP workflow
- they prefer commands that already work in this repository today
- where the repo still has legacy behavior, the runbooks call it out explicitly
