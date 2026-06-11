install pnpm: 

`curl -fsSL https://get.pnpm.io/install.sh | sh -`

clonar repo

`git clone https://github.com/ArtRiv/game-topicos-especiais.git` 

`cd game-topicos-especiais`

instalar deps do front:

`pnpm i`

rodar front:

`pnpm start`

em outro terminal:

`cd game-server`

instalar deps do back:

`npm i`

rodar back:

`npm run start`

entrar no front:

`http://localhost:5173`

## build de produção

gerar o build (type-check + bundle, sai na pasta `dist/`):

`pnpm build`

testar o build localmente:

`pnpm serve`

obs: o `dist/` contém o front completo (html, js e assets). o game-server não tem etapa de build — roda direto com `npm run start` (tsx).

