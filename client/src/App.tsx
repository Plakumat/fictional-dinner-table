import { lazy, Suspense, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { Chat } from './ui/chat/Chat';
import { Home } from './ui/home/Home';
import { Inspector } from './ui/inspector/Inspector';
import { RightPanel } from './ui/shell/RightPanel';
import { Sidebar } from './ui/shell/Sidebar';
import styles from './ui/shell/shell.module.css';
import { DocDialog } from './ui/sources/DocDialog';
import { OpenDocContext } from './ui/sources/DocContext';

// The help center is a separate chunk: it is not needed to chat, order or confirm.
const HelpSearch = lazy(() => import('./ui/help/Help').then((m) => ({ default: m.HelpSearch })));
const HelpDoc = lazy(() => import('./ui/help/Help').then((m) => ({ default: m.HelpDoc })));

/**
 * The frame: the account rail on the left, the assistant (or the help center)
 * in the middle, the cart and orders on the right. The chat lives in a store
 * outside React, so leaving the assistant route does not end a stream or lose
 * the transcript.
 */
export function App() {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);
  const onAssistant = useLocation().pathname === '/';

  return (
    <OpenDocContext.Provider value={setDocId}>
      <div className={styles.app} data-panel={onAssistant}>
        {/* The first thing the keyboard reaches: straight to the message box, past the rail and the start screen. */}
        {onAssistant && (
          <a href="#composer-input" className="skip-link">
            Skip to the message box
          </a>
        )}
        <Sidebar inspectorOpen={inspectorOpen} onToggleInspector={() => setInspectorOpen((open) => !open)} />
        <div className={styles.main}>
          <Suspense
            fallback={
              <p className="muted" style={{ padding: 24 }}>
                Loading…
              </p>
            }
          >
            <Routes>
              <Route
                path="/"
                element={
                  <>
                    <title>Sofra</title>
                    <Chat empty={<Home />} />
                  </>
                }
              />
              <Route path="/help" element={<HelpSearch />} />
              <Route path="/help/:docId" element={<HelpDoc />} />
            </Routes>
          </Suspense>
        </div>
        {onAssistant && <RightPanel />}
        <Inspector open={inspectorOpen} onClose={() => setInspectorOpen(false)} />
        <DocDialog docId={docId} onClose={() => setDocId(null)} />
      </div>
    </OpenDocContext.Provider>
  );
}
