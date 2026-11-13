import catalog from '../../../../services/sdr/demo/ecosystem/catalog.json';
export const localSolutionIds=new Set(catalog.solutions.map(solution=>solution.id));
export function isLocalSolutionDetail(view:string):boolean{const parts=view.split('/');return parts.length===2&&parts[0]==='systems'&&localSolutionIds.has(parts[1]);}
