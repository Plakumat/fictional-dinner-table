import { createContext, useContext } from 'react';

/** Opens a help-center document in the viewer. Provided by <App>. */
export const OpenDocContext = createContext<(docId: string) => void>(() => {});

export const useOpenDoc = () => useContext(OpenDocContext);
