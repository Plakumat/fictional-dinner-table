import { lazy, Suspense, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { Chat } from './ui/chat/Chat';
import { Home } from './ui/home/Home';
import { Inspector } from './ui/inspector/Inspector';
import { Drawer, MobileBar } from './ui/shell/MobileShell';
import { RightPanel } from './ui/shell/RightPanel';
import { Sidebar } from './ui/shell/Sidebar';
import styles from './ui/shell/shell.module.css';
import { DocDialog } from './ui/sources/DocDialog';
import { OpenDocContext } from './ui/sources/DocContext';
import { COMPACT, useMediaQuery } from './ui/useMediaQuery';

// The help center is a separate chunk: it is not needed to chat, order or confirm.
const HelpSearch = lazy(() => import('./ui/help/Help').then((m) => ({ default: m.HelpSearch })));
const HelpDoc = lazy(() => import('./ui/help/Help').then((m) => ({ default: m.HelpDoc })));

/**
 * The frame. On a desktop: the account rail on the left, the assistant (or
 * the help center) in the middle, the cart and orders on the right. On a
 * small screen: a top bar, and the rail and the panel as sheets. The chat
 * lives in a store outside React, so neither leaving the assistant route nor
 * opening a sheet ends a stream or loses the transcript.
 */
export function App() {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'menu' | 'cart' | null>(null);
  const onAssistant = useLocation().pathname === '/';
  const compact = useMediaQuery(COMPACT);

  const rail = <Sidebar inspectorOpen={inspectorOpen} onToggleInspector={() => setInspectorOpen((open) => !open)} />;

  return (
    <OpenDocContext.Provider value={setDocId}>
      <div className={styles.app} data-panel={onAssistant && !compact} data-compact={compact}>
        {/* The first thing the keyboard reaches: straight to the message box, past the rail and the start screen. */}
        {onAssistant && (
          <a href="#composer-input" className="skip-link">
            Skip to the message box
          </a>
        )}

        {compact ? (
          <>
            <MobileBar onMenu={() => setSheet('menu')} onCart={() => setSheet('cart')} />
            <Drawer open={sheet === 'menu'} side="left" label="Account and sections" onClose={() => setSheet(null)}>
              {rail}
            </Drawer>
            <Drawer open={sheet === 'cart'} side="right" label="Your cart and orders" onClose={() => setSheet(null)}>
              <RightPanel />
            </Drawer>
          </>
        ) : (
          rail
        )}

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

        {onAssistant && !compact && <RightPanel />}
        <Inspector open={inspectorOpen} onClose={() => setInspectorOpen(false)} />
        <DocDialog docId={docId} onClose={() => setDocId(null)} />
      </div>
    </OpenDocContext.Provider>
  );
}
