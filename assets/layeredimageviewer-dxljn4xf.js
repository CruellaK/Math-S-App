import{r,j as e}from"./index-Carg9_mO.js";import{c}from"./App-DwSLyiVk.js";import{R as z}from"./rotate-ccw-DgkfobYn.js";/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]],A=c("activity",S);/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",key:"ct8e1f"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242",key:"151rxh"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",key:"13bj9a"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]],L=c("eye-off",C);/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],R=c("eye",E);/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Z=[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",key:"zw3jo"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",key:"1wduqc"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",key:"kqbvx6"}]],q=c("layers",Z);/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const P=[["path",{d:"M3 7V5a2 2 0 0 1 2-2h2",key:"aa7l1z"}],["path",{d:"M17 3h2a2 2 0 0 1 2 2v2",key:"4qcy5o"}],["path",{d:"M21 17v2a2 2 0 0 1-2 2h-2",key:"6vwrx8"}],["path",{d:"M7 21H5a2 2 0 0 1-2-2v-2",key:"ioqczr"}],["path",{d:"M7 12h10",key:"b7w52i"}]],Y=c("scan-line",P);/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=[["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65",key:"13gj7c"}],["line",{x1:"11",x2:"11",y1:"8",y2:"14",key:"1vmskp"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11",key:"durymu"}]],V=c("zoom-in",O);/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=[["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65",key:"13gj7c"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11",key:"durymu"}]],H=c("zoom-out",D),J=({layers:n,title:v,description:T})=>{const[o,m]=r.useState(0),[b,p]=r.useState(1),[j,X]=r.useState(!0),[N,x]=r.useState(!1),[d,g]=r.useState(!1),[l,k]=r.useState(!1),[y,w]=r.useState({x:0,y:0}),h=r.useRef(null),i=n[o],_=a=>{if(!h.current)return;const t=h.current.getBoundingClientRect(),s=(a.clientX-t.left-t.width/2)/20,f=(a.clientY-t.top-t.height/2)/20;w({x:s,y:f})};r.useEffect(()=>{let a;return d&&(a=setInterval(()=>{m(t=>t>=n.length-1?(g(!1),t):(x(!0),setTimeout(()=>x(!1),600),t+1))},2e3)),()=>clearInterval(a)},[d,n.length]);const M=a=>{x(!0),m(a),setTimeout(()=>x(!1),600)},u=a=>{var s;const t=["from-rose-500 to-rose-600","from-red-500 to-red-600","from-orange-500 to-orange-600","from-amber-500 to-amber-600","from-yellow-500 to-yellow-600","from-lime-500 to-lime-600","from-green-500 to-green-600","from-emerald-500 to-emerald-600"];return((s=n[a])==null?void 0:s.color)||t[a%t.length]};return u(o).split(" ")[0].replace("from-",""),e.jsxs("div",{ref:h,className:"relative w-full rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/10 group select-none",onMouseMove:_,onMouseLeave:()=>w({x:0,y:0}),children:[e.jsx("div",{className:"absolute inset-0 opacity-20 pointer-events-none perspective-[1000px]",children:e.jsx("div",{className:"absolute inset-[-50%] w-[200%] h-[200%] bg-[linear-gradient(rgba(0,255,100,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,100,0.1)_1px,transparent_1px)] bg-[size:40px_40px] transform rotate-x-[60deg] animate-grid-move"})}),e.jsxs("div",{className:"relative z-30 flex items-start justify-between p-6 pointer-events-none",children:[e.jsxs("div",{className:"flex flex-col gap-1",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(A,{className:"w-4 h-4 text-emerald-400 animate-pulse"}),e.jsx("span",{className:"text-[10px] font-mono font-bold text-emerald-400 tracking-[0.2em] uppercase",children:"Système d'Analyse"})]}),e.jsx("h3",{className:"text-2xl md:text-3xl font-black text-white uppercase tracking-tighter drop-shadow-lg",children:v||"Exploration"}),e.jsxs("p",{className:"text-white/40 text-xs font-mono border-l-2 border-emerald-500/50 pl-2",children:[n.length," couches détectées • Zoom: ",Math.round(b*100),"%"]})]}),e.jsxs("div",{className:"flex flex-col gap-2 pointer-events-auto bg-black/40 backdrop-blur-md p-2 rounded-xl border border-white/5",children:[e.jsx("button",{onClick:()=>p(a=>Math.min(2.5,a+.25)),className:"p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors",children:e.jsx(V,{className:"w-5 h-5"})}),e.jsx("button",{onClick:()=>p(a=>Math.max(.5,a-.25)),className:"p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors",children:e.jsx(H,{className:"w-5 h-5"})}),e.jsx("button",{onClick:()=>{p(1),m(0)},className:"p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors",children:e.jsx(z,{className:"w-5 h-5"})})]})]}),e.jsxs("div",{className:"relative w-full aspect-[16/10] overflow-hidden flex items-center justify-center",children:[N&&e.jsx("div",{className:"absolute inset-0 z-40 pointer-events-none animate-scan-line bg-gradient-to-b from-transparent via-emerald-400/20 to-transparent"}),e.jsx("div",{className:"relative transition-transform duration-300 ease-out will-change-transform",style:{transform:`scale(${b}) rotateX(${y.y*.5}deg) rotateY(${y.x*.5}deg)`,perspective:"1000px",transformStyle:"preserve-3d"},children:n.map((a,t)=>{const s=l?t<=o:t===o,f=l?(o-t)*50:0,$=l?t===o?1:.4:s?1:0;return e.jsx("div",{className:`transition-all duration-700 ease-out ${t===0?"":"absolute inset-0"}`,style:{opacity:$,transform:`translateZ(${f}px)`,zIndex:n.length-t,filter:t!==o&&l?"grayscale(80%) blur(1px)":"none"},children:e.jsx("img",{src:a.image,alt:a.label,className:"max-w-full max-h-[400px] md:max-h-[500px] object-contain mx-auto drop-shadow-2xl"})},t)})}),e.jsx("div",{className:"absolute bottom-6 left-6 z-30",children:e.jsxs("div",{className:`px-6 py-3 rounded-tr-2xl rounded-bl-2xl bg-gradient-to-r ${u(o)} bg-opacity-90 backdrop-blur-md shadow-2xl border-l-4 border-white transform transition-all duration-300 hover:scale-105`,children:[e.jsxs("div",{className:"text-[10px] font-bold uppercase tracking-[0.2em] text-white/80 mb-1 flex items-center gap-2",children:[e.jsx(q,{className:"w-3 h-3"})," Niveau ",o+1]}),e.jsx("div",{className:"text-2xl font-black text-white uppercase tracking-tight",children:i==null?void 0:i.label})]})}),e.jsxs("button",{onClick:()=>k(!l),className:"absolute top-6 right-[80px] z-40 px-4 py-2 bg-black/60 backdrop-blur border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-widest rounded hover:bg-emerald-900/40 transition-all flex items-center gap-2",children:[l?e.jsx(L,{className:"w-4 h-4"}):e.jsx(R,{className:"w-4 h-4"}),l?"Mode Focus":"Mode 3D"]})]}),e.jsxs("div",{className:"relative z-20 bg-black/80 backdrop-blur-xl border-t border-white/10 p-6",children:[e.jsx("div",{className:"flex justify-between items-end gap-2 mb-6 h-24",children:n.map((a,t)=>{const s=t===o;return e.jsxs("button",{onClick:()=>M(t),className:`relative group flex-1 h-full flex flex-col justify-end items-center transition-all duration-300 ${s?"flex-[1.5]":"opacity-60 hover:opacity-100"}`,children:[e.jsx("div",{className:`w-full mb-3 rounded-sm transition-all duration-500 bg-gradient-to-t ${u(t)} ${s?"h-full opacity-20":"h-2 opacity-10 group-hover:h-8"}`}),e.jsx("span",{className:`absolute bottom-8 text-[10px] font-bold bg-black/80 px-2 py-1 rounded transition-opacity duration-300 ${s?"opacity-100 text-white":"opacity-0 text-white/60"}`,children:t+1}),e.jsx("div",{className:`w-3 h-3 rounded-full border-2 transition-all duration-300 ${s?"bg-white border-transparent scale-125 shadow-[0_0_10px_white]":"bg-transparent border-white/30 group-hover:border-white"}`})]},t)})}),e.jsx("div",{className:"flex justify-center",children:e.jsx("button",{onClick:()=>{m(0),g(!0)},disabled:d,className:`
                            relative overflow-hidden px-10 py-3 rounded-full font-bold text-sm uppercase tracking-widest transition-all
                            ${d?"bg-emerald-900/30 text-emerald-600 cursor-not-allowed border border-emerald-900":"bg-white text-black hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)]"}
                        `,children:d?e.jsxs("span",{className:"flex items-center gap-3",children:[e.jsxs("span",{className:"relative flex h-3 w-3",children:[e.jsx("span",{className:"animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"}),e.jsx("span",{className:"relative inline-flex rounded-full h-3 w-3 bg-emerald-500"})]}),"Analyse en cours..."]}):e.jsxs("span",{className:"flex items-center gap-2",children:[e.jsx(Y,{className:"w-4 h-4"})," Lancer l'Analyse Complète"]})})}),j&&(i==null?void 0:i.description)&&e.jsx("div",{className:"mt-6 p-4 rounded-xl bg-white/5 border border-white/5 text-center max-w-2xl mx-auto animate-fade-in-up",children:e.jsx("p",{className:"text-gray-300 text-sm md:text-base leading-relaxed font-light",children:i.description})})]}),e.jsx("style",{children:`
                @keyframes grid-move {
                    0% { background-position: 0 0; }
                    100% { background-position: 0 40px; }
                }
                .animate-grid-move {
                    animation: grid-move 20s linear infinite;
                }
                @keyframes scan-line {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-scan-line {
                    animation: scan-line 0.6s linear;
                }
                @keyframes fade-in-up {
                    0% { opacity: 0; transform: translateY(10px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.4s ease-out forwards;
                }
            `})]})};export{J as default};
