export const THEME_STORAGE_KEY = "fdf-theme";

// Runs before first paint so a remembered choice never flashes the other mode.
// Keep this a fixed string: it is injected into the page as an inline script.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("fdf-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
