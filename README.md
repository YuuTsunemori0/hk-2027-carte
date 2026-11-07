# HK 2027 — la carte

Carte interactive des lieux repérés pour le voyage à Hong Kong (16 → 24 janvier 2027).

- **Référence** : `src/data/places.json` (lieux, types, coordonnées, pourquoi y aller, reel d'origine).
- **Mes ajouts** : statut, « à commander », notes et photos, stockés dans Neon (Postgres) et Vercel Blob.
- **Carte** : MapLibre + fonds CARTO sombre/clair, géolocalisation, filtres par type, quartier et statut.

## Mise en place sur Vercel

1. Importer ce repo dans Vercel (framework : Vite, détecté automatiquement).
2. Onglet **Storage** du projet :
   - **Neon** (Postgres) → Connect to project. Fournit `DATABASE_URL`.
   - **Blob** → créer un store **Public** → Connect to project. Fournit `BLOB_READ_WRITE_TOKEN`.
3. **Settings → Environment Variables** : ajouter `APP_PASSWORD` (le mot de passe pour éditer).
4. Redéployer. Les tables `hk_notes` et `hk_attachments` se créent toutes seules au premier appel.

## API (fonctions Vercel, dossier `api/`)

| Route | Méthode | Rôle |
| --- | --- | --- |
| `/api/session` | GET / POST / DELETE | état de connexion, connexion par mot de passe, déconnexion |
| `/api/state` | GET | toutes les notes et pièces jointes |
| `/api/note?id=` | PUT | statut, liste « à commander », notes d'un lieu |
| `/api/attachment?placeId=` | POST | envoi d'une photo (corps = fichier, 4 Mo max) |
| `/api/attachment?id=` | DELETE | suppression d'une pièce jointe |

## Ajouter un lieu

Ajouter une entrée dans `src/data/places.json` (un `id` unique, `type` parmi les clés de `types`, `lat`/`lng`), puis pousser : Vercel redéploie.

## Développement local

```bash
npm install
npx vercel dev   # front + fonctions API, avec les variables tirées de Vercel (vercel env pull)
```
