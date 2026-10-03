# Supabase database workflow

The project is linked to the cloud Supabase project `scnkhmbjmzqhoxhlbjje`
("Agora") via the Supabase CLI. Schema changes are managed as migration files
and pushed with the CLI — no more manual SQL pasting.

## One-time setup (already done)

- `npx supabase init` — created `supabase/config.toml`
- `npx supabase login` — authenticated the CLI (per developer)
- `npx supabase link --project-ref scnkhmbjmzqhoxhlbjje` — linked to the cloud DB
- The initial migration `supabase/migrations/20261003000001_init.sql` was marked
  as already-applied with `supabase migration repair --status applied 20261003000001`
  (because it had been run manually first).

Each new teammate only needs: `npx supabase login` then
`npx supabase link --project-ref scnkhmbjmzqhoxhlbjje`.

## Making a schema change

1. Create a new migration file:
   ```
   npx supabase migration new <name>
   ```
   This creates `supabase/migrations/<timestamp>_<name>.sql`. Write your DDL in it.

2. Preview what will be applied:
   ```
   npx supabase db push --dry-run
   ```

3. Apply it to the cloud DB:
   ```
   npx supabase db push
   ```

4. Check sync status anytime:
   ```
   npx supabase migration list
   ```

## Seeding demo data

The demo patient (DEMO PROTOCOL) is seeded via a script that uses the app's env:

```
npm run seed
```

(Equivalent SQL is in `supabase/seed/0001_demo_patient.sql` if you prefer the editor.)

## Health check

With the dev server running, visit `http://localhost:3000/api/health` to confirm
connectivity, schema, and seed status.

## Notes

- `config.toml` is safe to commit. Never commit `.env.local` (it holds keys).
- RLS is enabled on all tables; the demo policy is permissive for the anon key.
  Tighten it before any real deployment (see comments in the init migration).
