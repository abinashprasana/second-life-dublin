import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/lato/latin-400.css'
import '@fontsource/lato/latin-700.css'
import '@fontsource/newsreader/latin-400.css'
import '@fontsource/newsreader/latin-400-italic.css'
import '@fontsource/newsreader/latin-500.css'
import '@fontsource/newsreader/latin-500-italic.css'
import 'leaflet/dist/leaflet.css'
import ProductApp from './ProductApp'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProductApp />
  </React.StrictMode>,
)
