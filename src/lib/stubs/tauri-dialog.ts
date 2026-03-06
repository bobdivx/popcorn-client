// Stub pour @tauri-apps/plugin-dialog en mode web
// Ce fichier est utilisé comme alias Vite pour éviter les erreurs de résolution

export const open = async () => {
  throw new Error('Tauri dialog is not available in web mode');
};

export default {
  open,
};
