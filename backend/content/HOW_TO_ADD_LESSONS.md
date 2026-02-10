# How to Add a Lesson

## Authoring
- Create a YAML file at `backend/content/lessons-src/en/basic-N.yaml`.
- Keep sentences short and follow the Lesson Blueprint.

## Generate + Validate (run from `backend/`)
```sh
npm run generate:lessons
npm run validate:lessons
npm test
```

## Commit These Paths
- `backend/content/lessons-src/**`
- `backend/src/lessons/**`

## Quality Checklist
- One concept per question
- ≤ 12 words
- `acceptedAnswers` includes `answer`
- Hints are calm and short
- `conceptTag`s are consistent
