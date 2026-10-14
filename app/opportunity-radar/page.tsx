import {Suspense} from 'react';
import Workspace from '../../components/Workspace';
export default function Page(){return <Suspense fallback={<main>Loading Opportunity Radar…</main>}><Workspace module="opportunity-radar"/></Suspense>}
