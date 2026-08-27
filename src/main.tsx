import { createRoot } from 'react-dom/client'
import App from './App'
import { installPersistence } from './sim/store'
import './styles.css'

installPersistence()

// Sem StrictMode: o duplo mount de desenvolvimento criaria dois contextos WebGL.
createRoot(document.getElementById('root')!).render(<App />)
