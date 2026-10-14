import {Suspense} from 'react';
import Workspace from '../../components/Workspace';
export default function Page(){return <Suspense fallback={<main><p>Loading HELIO workspace…</p></main>}><Workspace module="projects"/></Suspense>}
