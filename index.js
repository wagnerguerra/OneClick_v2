// Entry local — padrão monorepo do Expo Router.
//
// Em vez de apontar o "main" do package.json direto p/ "expo-router/entry" (que
// vive no store .pnpm, fora do app), usamos um entry DENTRO do app. Assim o
// gradle relativiza o entry contra o projeto (apps/mobile) como "index.js" — sem
// o "../../" que escapa do drive quando o Metro resolve a partir do serverRoot
// (workspace). Resolve o "Unable to resolve ...entry.js" no build de release.
import 'expo-router/entry'
