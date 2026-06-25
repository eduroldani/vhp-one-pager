# Airtable Setup

Use Airtable as the CMS and GitHub Pages as the static host.

## Required Table

Create a table called `Startup Description`.

Recommended fields:

- `Status` - single select: `Draft`, `Ready`, `Published`
- `Slug` - single line text, e.g. `autocast`
- `Founders` - linked records to `Alumni`
- `Startup Name (from Founders)` - lookup, or `Startup Name`
- `Tagline`
- `Quick Facts` - short text, one fact per line. Use `Label: value` when useful.
- `Founding Date`
- `Stage of Company / Product Stage`
- `Team Size`
- `Contact` - email
- `Main Contact` - linked record to `Contact`
- `Website`
- `Problem` - long text
- `Solution` - long text
- `Target Customer` - long text
- `Value Proposition` - long text
- `Go-to-Market` - long text
- `Core Team` - optional long text, one person per line using `Name | Role | bullet 1; bullet 2 | LinkedIn`
- `Market Opportunity` - long text, one bullet per line
- `Competiros` or `Competitors` - long text, one bullet per line
- `Business Model Intro` - optional long text
- `Business Model` - long text
- `Competitive Adventage` - long text
- `Key Milestones` - long text, one bullet per line
- `Milestones Reached` - optional long text, one bullet per line
- `Milestones Planned` - long text, one bullet per line
- `Tackling` - optional long text
- `Competitive Advantage Intro` - optional long text
- `Competitive Advantage` - long text, one bullet per line
- `Support Need`
- `Support Needed`
- `Support Need Label` - optional
- `Logo Text` - optional, e.g. `AC`
- `Incubator Logo` - optional attachment or public URL

## Founders Table

Create or use a table called `Alumni`.

Required fields:

- `Name`
- `LinkedIn`

The `Founders` field in `Startup Description` should link to records in `Alumni`. Founder names become clickable LinkedIn links in the online page.

## Contact Table

Create or use a table called `Contact`.

Recommended fields:

- `Name`
- `Role`
- `Email`
- `Phone`
- `Linkedin`

The `Main Contact` field in `Startup Description` should link to records in `Contact`.

Only records with empty `Status`, `Ready`, `Published`, or `Live` are included in the build.

## Local Build

Copy `.env.example` to `.env.local` and fill in the Airtable values.

```sh
npm run build
```

If Airtable credentials are missing, the build uses the current local sample data.

## GitHub Pages Build

Add these repository secrets in GitHub:

- `AIRTABLE_TOKEN`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_STARTUPS_TABLE`
- `AIRTABLE_FOUNDERS_TABLE`
- `AIRTABLE_CONTACTS_TABLE`
- `AIRTABLE_VIEW`

Then every push to `main` rebuilds the static pages from Airtable.
