---
description: How to push changes in this repo
---

## Push Preference

Unless the user explicitly says otherwise, **always push only to `other-repo`** (https://github.com/mayormoris-ui/OpenSapce-chatbot.git).

Do NOT push to `origin` (Patrickd1234/Chat-bot) unless the user specifically requests it.

## Steps

1. Stage all changes:
```
git add .
```

2. Commit with a descriptive message:
```
git commit -m "<message>"
```

3. Push to other-repo only:
```
git push other-repo Gojo:Gojo --force
```

> If the branch name differs from `Gojo`, adjust accordingly.
