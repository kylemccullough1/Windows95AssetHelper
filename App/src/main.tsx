import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { StudioDesktop } from './studio/StudioDesktop'

const root = document.getElementById('root')
if (!root) throw new Error('index.html is missing #root')

createRoot(root).render(
  <StrictMode>
    <StudioDesktop />
  </StrictMode>,
)
