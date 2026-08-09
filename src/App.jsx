import React, { useState } from 'react';
import ProjectHub from './components/ProjectHub.jsx';
import Workspace from './components/Workspace.jsx';

export default function App() {
  const [session, setSession] = useState(null);

  if (!session) {
    return <ProjectHub onOpen={(rootHandle, project) => setSession({ rootHandle, project })} />;
  }

  return <Workspace rootHandle={session.rootHandle} initialProject={session.project} onCloseProject={() => setSession(null)} />;
}
