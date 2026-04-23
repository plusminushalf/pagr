/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

declare module '*?url' {
  const src: string;
  export default src;
}
