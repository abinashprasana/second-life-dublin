// Shared interface and renderer palette.
export const palette = {
  "surfaceDeep": "#101E32",
  "surfacePanel": "#1B304B",
  "surfaceRaised": "#29435F",
  "paper": "#F5F1E8",
  "card": "#FFFCF6",
  "ink": "#17283F",
  "muted": "#526279",
  "line": "#CDD4DD",
  "controlBorder": "#788DA7",
  "darkLine": "#536C89",
  "textOnDark": "#F5F1E8",
  "mutedOnDark": "#BECDE0",
  "accent": "#B94F27",
  "accentText": "#A94723",
  "selection": "#F2AE7E",
  "mapLine": "#B9D8F0",
  "mapArea": "#7E9EBE",
  "mapBase": "#203A56",
  "service": "#D2C5F4",
  "lightTint": "#E8EDF2",
  "shadow": "#000000"
} as const
export function applyTheme() {
 for (const [name, value] of Object.entries(palette)) document.documentElement.style.setProperty(`--${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value)
}
