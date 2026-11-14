import catalog from '../../../../services/sdr/demo/ecosystem/catalog.json';

const localSolutionIds = new Set(catalog.solutions.map(solution => solution.id));
const platformViews = new Set(['home','map','tools','team','crm','clips','genesis','business']);
const projectView = /^(?:tools|genesis)\/build_[a-f0-9]{48}$/;

export function isLocalPlatformView(view:string):boolean {
 if (platformViews.has(view) || view === 'genesis/new' || projectView.test(view)) return true;
 const parts = view.split('/');
 return parts.length === 2 && parts[0] === 'systems' && localSolutionIds.has(parts[1]);
}

export function isLocalDemoDestination(view:string):boolean {
 return isLocalPlatformView(view) || ['sdr','multipropriedades','financeai'].includes(view);
}
