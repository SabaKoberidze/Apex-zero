import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// No StrictMode: its double-mount would tear down and rebuild the WebGL
// context on the same canvas, which browsers do not hand back cleanly.
createRoot(document.getElementById('root')!).render(<App />);
