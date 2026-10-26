import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startNative } from './native';
import './styles.css';

startNative();
createRoot(document.getElementById('root')!).render(<App />);
