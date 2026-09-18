var LdsPanel = (function (exports) {
  'use strict';

  /**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  const t$1=globalThis,e$2=t$1.ShadowRoot&&(void 0===t$1.ShadyCSS||t$1.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,s$2=Symbol(),o$3=new WeakMap;let n$2 = class n{constructor(t,e,o){if(this._$cssResult$=true,o!==s$2)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e;}get styleSheet(){let t=this.o;const s=this.t;if(e$2&&void 0===t){const e=void 0!==s&&1===s.length;e&&(t=o$3.get(s)),void 0===t&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),e&&o$3.set(s,t));}return t}toString(){return this.cssText}};const r$2=t=>new n$2("string"==typeof t?t:t+"",void 0,s$2),i$3=(t,...e)=>{const o=1===t.length?t[0]:e.reduce((e,s,o)=>e+(t=>{if(true===t._$cssResult$)return t.cssText;if("number"==typeof t)return t;throw Error("Value passed to 'css' function must be a 'css' function result: "+t+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(s)+t[o+1],t[0]);return new n$2(o,t,s$2)},S$1=(s,o)=>{if(e$2)s.adoptedStyleSheets=o.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const e of o){const o=document.createElement("style"),n=t$1.litNonce;void 0!==n&&o.setAttribute("nonce",n),o.textContent=e.cssText,s.appendChild(o);}},c$2=e$2?t=>t:t=>t instanceof CSSStyleSheet?(t=>{let e="";for(const s of t.cssRules)e+=s.cssText;return r$2(e)})(t):t;

  /**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */const{is:i$2,defineProperty:e$1,getOwnPropertyDescriptor:h$1,getOwnPropertyNames:r$1,getOwnPropertySymbols:o$2,getPrototypeOf:n$1}=Object,a$1=globalThis,c$1=a$1.trustedTypes,l$1=c$1?c$1.emptyScript:"",p$1=a$1.reactiveElementPolyfillSupport,d$1=(t,s)=>t,u$1={toAttribute(t,s){switch(s){case Boolean:t=t?l$1:null;break;case Object:case Array:t=null==t?t:JSON.stringify(t);}return t},fromAttribute(t,s){let i=t;switch(s){case Boolean:i=null!==t;break;case Number:i=null===t?null:Number(t);break;case Object:case Array:try{i=JSON.parse(t);}catch(t){i=null;}}return i}},f$1=(t,s)=>!i$2(t,s),b$1={attribute:true,type:String,converter:u$1,reflect:false,useDefault:false,hasChanged:f$1};Symbol.metadata??=Symbol("metadata"),a$1.litPropertyMetadata??=new WeakMap;let y$1 = class y extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??=[]).push(t);}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,s=b$1){if(s.state&&(s.attribute=false),this._$Ei(),this.prototype.hasOwnProperty(t)&&((s=Object.create(s)).wrapped=true),this.elementProperties.set(t,s),!s.noAccessor){const i=Symbol(),h=this.getPropertyDescriptor(t,i,s);void 0!==h&&e$1(this.prototype,t,h);}}static getPropertyDescriptor(t,s,i){const{get:e,set:r}=h$1(this.prototype,t)??{get(){return this[s]},set(t){this[s]=t;}};return {get:e,set(s){const h=e?.call(this);r?.call(this,s),this.requestUpdate(t,h,i);},configurable:true,enumerable:true}}static getPropertyOptions(t){return this.elementProperties.get(t)??b$1}static _$Ei(){if(this.hasOwnProperty(d$1("elementProperties")))return;const t=n$1(this);t.finalize(),void 0!==t.l&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties);}static finalize(){if(this.hasOwnProperty(d$1("finalized")))return;if(this.finalized=true,this._$Ei(),this.hasOwnProperty(d$1("properties"))){const t=this.properties,s=[...r$1(t),...o$2(t)];for(const i of s)this.createProperty(i,t[i]);}const t=this[Symbol.metadata];if(null!==t){const s=litPropertyMetadata.get(t);if(void 0!==s)for(const[t,i]of s)this.elementProperties.set(t,i);}this._$Eh=new Map;for(const[t,s]of this.elementProperties){const i=this._$Eu(t,s);void 0!==i&&this._$Eh.set(i,t);}this.elementStyles=this.finalizeStyles(this.styles);}static finalizeStyles(s){const i=[];if(Array.isArray(s)){const e=new Set(s.flat(1/0).reverse());for(const s of e)i.unshift(c$2(s));}else void 0!==s&&i.push(c$2(s));return i}static _$Eu(t,s){const i=s.attribute;return  false===i?void 0:"string"==typeof i?i:"string"==typeof t?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=false,this.hasUpdated=false,this._$Em=null,this._$Ev();}_$Ev(){this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(t=>t(this));}addController(t){(this._$EO??=new Set).add(t),void 0!==this.renderRoot&&this.isConnected&&t.hostConnected?.();}removeController(t){this._$EO?.delete(t);}_$E_(){const t=new Map,s=this.constructor.elementProperties;for(const i of s.keys())this.hasOwnProperty(i)&&(t.set(i,this[i]),delete this[i]);t.size>0&&(this._$Ep=t);}createRenderRoot(){const t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return S$1(t,this.constructor.elementStyles),t}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(true),this._$EO?.forEach(t=>t.hostConnected?.());}enableUpdating(t){}disconnectedCallback(){this._$EO?.forEach(t=>t.hostDisconnected?.());}attributeChangedCallback(t,s,i){this._$AK(t,i);}_$ET(t,s){const i=this.constructor.elementProperties.get(t),e=this.constructor._$Eu(t,i);if(void 0!==e&&true===i.reflect){const h=(void 0!==i.converter?.toAttribute?i.converter:u$1).toAttribute(s,i.type);this._$Em=t,null==h?this.removeAttribute(e):this.setAttribute(e,h),this._$Em=null;}}_$AK(t,s){const i=this.constructor,e=i._$Eh.get(t);if(void 0!==e&&this._$Em!==e){const t=i.getPropertyOptions(e),h="function"==typeof t.converter?{fromAttribute:t.converter}:void 0!==t.converter?.fromAttribute?t.converter:u$1;this._$Em=e;const r=h.fromAttribute(s,t.type);this[e]=r??this._$Ej?.get(e)??r,this._$Em=null;}}requestUpdate(t,s,i,e=false,h){if(void 0!==t){const r=this.constructor;if(false===e&&(h=this[t]),i??=r.getPropertyOptions(t),!((i.hasChanged??f$1)(h,s)||i.useDefault&&i.reflect&&h===this._$Ej?.get(t)&&!this.hasAttribute(r._$Eu(t,i))))return;this.C(t,s,i);} false===this.isUpdatePending&&(this._$ES=this._$EP());}C(t,s,{useDefault:i,reflect:e,wrapped:h},r){i&&!(this._$Ej??=new Map).has(t)&&(this._$Ej.set(t,r??s??this[t]),true!==h||void 0!==r)||(this._$AL.has(t)||(this.hasUpdated||i||(s=void 0),this._$AL.set(t,s)),true===e&&this._$Em!==t&&(this._$Eq??=new Set).add(t));}async _$EP(){this.isUpdatePending=true;try{await this._$ES;}catch(t){Promise.reject(t);}const t=this.scheduleUpdate();return null!=t&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[t,s]of this._$Ep)this[t]=s;this._$Ep=void 0;}const t=this.constructor.elementProperties;if(t.size>0)for(const[s,i]of t){const{wrapped:t}=i,e=this[s];true!==t||this._$AL.has(s)||void 0===e||this.C(s,void 0,i,e);}}let t=false;const s=this._$AL;try{t=this.shouldUpdate(s),t?(this.willUpdate(s),this._$EO?.forEach(t=>t.hostUpdate?.()),this.update(s)):this._$EM();}catch(s){throw t=false,this._$EM(),s}t&&this._$AE(s);}willUpdate(t){}_$AE(t){this._$EO?.forEach(t=>t.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=true,this.firstUpdated(t)),this.updated(t);}_$EM(){this._$AL=new Map,this.isUpdatePending=false;}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return  true}update(t){this._$Eq&&=this._$Eq.forEach(t=>this._$ET(t,this[t])),this._$EM();}updated(t){}firstUpdated(t){}};y$1.elementStyles=[],y$1.shadowRootOptions={mode:"open"},y$1[d$1("elementProperties")]=new Map,y$1[d$1("finalized")]=new Map,p$1?.({ReactiveElement:y$1}),(a$1.reactiveElementVersions??=[]).push("2.1.2");

  /**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  const t=globalThis,i$1=t=>t,s$1=t.trustedTypes,e=s$1?s$1.createPolicy("lit-html",{createHTML:t=>t}):void 0,h="$lit$",o$1=`lit$${Math.random().toFixed(9).slice(2)}$`,n="?"+o$1,r=`<${n}>`,l=document,c=()=>l.createComment(""),a=t=>null===t||"object"!=typeof t&&"function"!=typeof t,u=Array.isArray,d=t=>u(t)||"function"==typeof t?.[Symbol.iterator],f="[ \t\n\f\r]",v=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,_=/-->/g,m=/>/g,p=RegExp(`>|${f}(?:([^\\s"'>=/]+)(${f}*=${f}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),g=/'/g,$=/"/g,y=/^(?:script|style|textarea|title)$/i,x=t=>(i,...s)=>({_$litType$:t,strings:i,values:s}),b=x(1),E=Symbol.for("lit-noChange"),A=Symbol.for("lit-nothing"),C=new WeakMap,P=l.createTreeWalker(l,129);function V(t,i){if(!u(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==e?e.createHTML(i):i}const N=(t,i)=>{const s=t.length-1,e=[];let n,l=2===i?"<svg>":3===i?"<math>":"",c=v;for(let i=0;i<s;i++){const s=t[i];let a,u,d=-1,f=0;for(;f<s.length&&(c.lastIndex=f,u=c.exec(s),null!==u);)f=c.lastIndex,c===v?"!--"===u[1]?c=_:void 0!==u[1]?c=m:void 0!==u[2]?(y.test(u[2])&&(n=RegExp("</"+u[2],"g")),c=p):void 0!==u[3]&&(c=p):c===p?">"===u[0]?(c=n??v,d=-1):void 0===u[1]?d=-2:(d=c.lastIndex-u[2].length,a=u[1],c=void 0===u[3]?p:'"'===u[3]?$:g):c===$||c===g?c=p:c===_||c===m?c=v:(c=p,n=void 0);const x=c===p&&t[i+1].startsWith("/>")?" ":"";l+=c===v?s+r:d>=0?(e.push(a),s.slice(0,d)+h+s.slice(d)+o$1+x):s+o$1+(-2===d?i:x);}return [V(t,l+(t[s]||"<?>")+(2===i?"</svg>":3===i?"</math>":"")),e]};class S{constructor({strings:t,_$litType$:i},e){let r;this.parts=[];let l=0,a=0;const u=t.length-1,d=this.parts,[f,v]=N(t,i);if(this.el=S.createElement(f,e),P.currentNode=this.el.content,2===i||3===i){const t=this.el.content.firstChild;t.replaceWith(...t.childNodes);}for(;null!==(r=P.nextNode())&&d.length<u;){if(1===r.nodeType){if(r.hasAttributes())for(const t of r.getAttributeNames())if(t.endsWith(h)){const i=v[a++],s=r.getAttribute(t).split(o$1),e=/([.?@])?(.*)/.exec(i);d.push({type:1,index:l,name:e[2],strings:s,ctor:"."===e[1]?I:"?"===e[1]?L:"@"===e[1]?z:H}),r.removeAttribute(t);}else t.startsWith(o$1)&&(d.push({type:6,index:l}),r.removeAttribute(t));if(y.test(r.tagName)){const t=r.textContent.split(o$1),i=t.length-1;if(i>0){r.textContent=s$1?s$1.emptyScript:"";for(let s=0;s<i;s++)r.append(t[s],c()),P.nextNode(),d.push({type:2,index:++l});r.append(t[i],c());}}}else if(8===r.nodeType)if(r.data===n)d.push({type:2,index:l});else {let t=-1;for(;-1!==(t=r.data.indexOf(o$1,t+1));)d.push({type:7,index:l}),t+=o$1.length-1;}l++;}}static createElement(t,i){const s=l.createElement("template");return s.innerHTML=t,s}}function M(t,i,s=t,e){if(i===E)return i;let h=void 0!==e?s._$Co?.[e]:s._$Cl;const o=a(i)?void 0:i._$litDirective$;return h?.constructor!==o&&(h?._$AO?.(false),void 0===o?h=void 0:(h=new o(t),h._$AT(t,s,e)),void 0!==e?(s._$Co??=[])[e]=h:s._$Cl=h),void 0!==h&&(i=M(t,h._$AS(t,i.values),h,e)),i}class R{constructor(t,i){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=i;}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){const{el:{content:i},parts:s}=this._$AD,e=(t?.creationScope??l).importNode(i,true);P.currentNode=e;let h=P.nextNode(),o=0,n=0,r=s[0];for(;void 0!==r;){if(o===r.index){let i;2===r.type?i=new k(h,h.nextSibling,this,t):1===r.type?i=new r.ctor(h,r.name,r.strings,this,t):6===r.type&&(i=new Z(h,this,t)),this._$AV.push(i),r=s[++n];}o!==r?.index&&(h=P.nextNode(),o++);}return P.currentNode=l,e}p(t){let i=0;for(const s of this._$AV) void 0!==s&&(void 0!==s.strings?(s._$AI(t,s,i),i+=s.strings.length-2):s._$AI(t[i])),i++;}}class k{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(t,i,s,e){this.type=2,this._$AH=A,this._$AN=void 0,this._$AA=t,this._$AB=i,this._$AM=s,this.options=e,this._$Cv=e?.isConnected??true;}get parentNode(){let t=this._$AA.parentNode;const i=this._$AM;return void 0!==i&&11===t?.nodeType&&(t=i.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,i=this){t=M(this,t,i),a(t)?t===A||null==t||""===t?(this._$AH!==A&&this._$AR(),this._$AH=A):t!==this._$AH&&t!==E&&this._(t):void 0!==t._$litType$?this.$(t):void 0!==t.nodeType?this.T(t):d(t)?this.k(t):this._(t);}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t));}_(t){this._$AH!==A&&a(this._$AH)?this._$AA.nextSibling.data=t:this.T(l.createTextNode(t)),this._$AH=t;}$(t){const{values:i,_$litType$:s}=t,e="number"==typeof s?this._$AC(t):(void 0===s.el&&(s.el=S.createElement(V(s.h,s.h[0]),this.options)),s);if(this._$AH?._$AD===e)this._$AH.p(i);else {const t=new R(e,this),s=t.u(this.options);t.p(i),this.T(s),this._$AH=t;}}_$AC(t){let i=C.get(t.strings);return void 0===i&&C.set(t.strings,i=new S(t)),i}k(t){u(this._$AH)||(this._$AH=[],this._$AR());const i=this._$AH;let s,e=0;for(const h of t)e===i.length?i.push(s=new k(this.O(c()),this.O(c()),this,this.options)):s=i[e],s._$AI(h),e++;e<i.length&&(this._$AR(s&&s._$AB.nextSibling,e),i.length=e);}_$AR(t=this._$AA.nextSibling,s){for(this._$AP?.(false,true,s);t!==this._$AB;){const s=i$1(t).nextSibling;i$1(t).remove(),t=s;}}setConnected(t){ void 0===this._$AM&&(this._$Cv=t,this._$AP?.(t));}}class H{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,i,s,e,h){this.type=1,this._$AH=A,this._$AN=void 0,this.element=t,this.name=i,this._$AM=e,this.options=h,s.length>2||""!==s[0]||""!==s[1]?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=A;}_$AI(t,i=this,s,e){const h=this.strings;let o=false;if(void 0===h)t=M(this,t,i,0),o=!a(t)||t!==this._$AH&&t!==E,o&&(this._$AH=t);else {const e=t;let n,r;for(t=h[0],n=0;n<h.length-1;n++)r=M(this,e[s+n],i,n),r===E&&(r=this._$AH[n]),o||=!a(r)||r!==this._$AH[n],r===A?t=A:t!==A&&(t+=(r??"")+h[n+1]),this._$AH[n]=r;}o&&!e&&this.j(t);}j(t){t===A?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"");}}class I extends H{constructor(){super(...arguments),this.type=3;}j(t){this.element[this.name]=t===A?void 0:t;}}class L extends H{constructor(){super(...arguments),this.type=4;}j(t){this.element.toggleAttribute(this.name,!!t&&t!==A);}}class z extends H{constructor(t,i,s,e,h){super(t,i,s,e,h),this.type=5;}_$AI(t,i=this){if((t=M(this,t,i,0)??A)===E)return;const s=this._$AH,e=t===A&&s!==A||t.capture!==s.capture||t.once!==s.once||t.passive!==s.passive,h=t!==A&&(s===A||e);e&&this.element.removeEventListener(this.name,this,s),h&&this.element.addEventListener(this.name,this,t),this._$AH=t;}handleEvent(t){"function"==typeof this._$AH?this._$AH.call(this.options?.host??this.element,t):this._$AH.handleEvent(t);}}class Z{constructor(t,i,s){this.element=t,this.type=6,this._$AN=void 0,this._$AM=i,this.options=s;}get _$AU(){return this._$AM._$AU}_$AI(t){M(this,t);}}const B=t.litHtmlPolyfillSupport;B?.(S,k),(t.litHtmlVersions??=[]).push("3.3.3");const D=(t,i,s)=>{const e=s?.renderBefore??i;let h=e._$litPart$;if(void 0===h){const t=s?.renderBefore??null;e._$litPart$=h=new k(i.insertBefore(c(),t),t,void 0,s??{});}return h._$AI(t),h};

  /**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */const s=globalThis;class i extends y$1{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0;}createRenderRoot(){const t=super.createRenderRoot();return this.renderOptions.renderBefore??=t.firstChild,t}update(t){const r=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=D(r,this.renderRoot,this.renderOptions);}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(true);}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(false);}render(){return E}}i._$litElement$=true,i["finalized"]=true,s.litElementHydrateSupport?.({LitElement:i});const o=s.litElementPolyfillSupport;o?.({LitElement:i});(s.litElementVersions??=[]).push("4.2.2");

  /**
   * LdsDebugPanel — floating debug panel for any LitElement app.
   * Ported from ruf-debug-panel.js. All __RUF_* → __LDS_*, ACI tab → Events tab.
   * Network entries use `decoded` field (set by registered decoder plugin).
   */


  // ── Session ID ─────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined' && !window.__LDS_SESSION_ID__) {
      window.__LDS_SESSION_ID__ = `lds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }
  if (typeof window !== 'undefined' && !window.__LDS_HISTORY__) {
      window.__LDS_HISTORY__ = [];
  }

  // ── Utilities ──────────────────────────────────────────────────────────────
  function _parseBrowserInfo() {
      const ua = navigator.userAgent;
      const edge   = ua.match(/Edg\/([\d.]+)/);
      const chrome = ua.match(/Chrome\/([\d.]+)/);
      const ff     = ua.match(/Firefox\/([\d.]+)/);
      const safari = !chrome && ua.match(/Version\/([\d.]+).*Safari/);
      if (edge)   return `Edge ${edge[1]}`;
      if (chrome) return `Chrome ${chrome[1]}`;
      if (ff)     return `Firefox ${ff[1]}`;
      if (safari) return `Safari ${safari[1]}`;
      return ua.slice(0, 80);
  }

  function _tagToFilePath(tag) {
      if (typeof window.__LDS_TAG_TO_FILE__ === 'function') return window.__LDS_TAG_TO_FILE__(tag);
      return `src/components/${tag}/${tag}.js`;
  }

  function _extractLineNumber(stack) {
      if (!stack) return null;
      var lines = stack.split('\n');
      for (var i = 0; i < lines.length; i++) {
          var m = lines[i].match(/src\/(?:elements|components|base|managers|helpers|utils)\/[^:]+:(\d+):\d+/);
          if (m) return parseInt(m[1], 10);
      }
      return null;
  }

  function _findRelatedComponents(tag, eventsTimeline) {
      if (!eventsTimeline || !eventsTimeline.length) return [];
      var myActions = {};
      eventsTimeline.forEach(function (e) {
          if (e.from === tag) myActions[e.name] = true;
      });
      var related = {};
      eventsTimeline.forEach(function (e) {
          if (e.from !== tag && myActions[e.name]) related[e.from] = true;
      });
      return Object.keys(related).filter(Boolean);
  }

  function _filterAppStack(stack) {
      if (!stack) return '';
      const customRe = window.__LDS_STACK_FILTER_RE__ || /node_modules[\\/](?!ui-platform)/i;
      const lines = stack.split('\n');
      const kept = lines.filter(line => {
          if (!line.includes('node_modules/')) return true;
          if (!customRe.test(line)) return true; // matches exception pattern = keep
          return false;
      });
      const meaningful = kept.filter(l => l.trim() && !l.trim().startsWith('Error'));
      return meaningful.length > 0 ? kept.join('\n') : lines.slice(0, 5).join('\n');
  }

  // ── History ────────────────────────────────────────────────────────────────
  function _saveToHistory(report, source = 'live') {
      const h = window.__LDS_HISTORY__;
      h.push({ id: `h-${Date.now()}`, capturedAt: report.reportTime || new Date().toISOString(), source, sessionId: report.sessionId, report });
      if (h.length > 20) h.shift();
  }

  // ── Environment ────────────────────────────────────────────────────────────
  function _captureEnvironment() {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const mem = performance.memory;
      return {
          browser:  { userAgent: navigator.userAgent, version: _parseBrowserInfo(), language: navigator.language, onLine: navigator.onLine, cookiesEnabled: navigator.cookieEnabled },
          hardware: { cpuCores: navigator.hardwareConcurrency || 'unknown', deviceMemoryGB: navigator.deviceMemory || 'unknown', screen: `${screen.width}x${screen.height} @${window.devicePixelRatio}x` },
          network:  conn ? { effectiveType: conn.effectiveType, downlinkMbps: conn.downlink, rttMs: conn.rtt, saveData: conn.saveData } : null,
          heap:     mem ? { usedMB: Math.round(mem.usedJSHeapSize / 1048576), totalMB: Math.round(mem.totalJSHeapSize / 1048576), limitMB: Math.round(mem.jsHeapSizeLimit / 1048576) } : null,
          pageLoad: (() => {
              const nav = performance.getEntriesByType('navigation')[0];
              if (!nav) return null;
              return { dnsMs: Math.round(nav.domainLookupEnd - nav.domainLookupStart), ttfbMs: Math.round(nav.responseStart - nav.requestStart), domInteractiveMs: Math.round(nav.domInteractive), loadMs: Math.round(nav.loadEventEnd) };
          })(),
          url:       location.href,
          capturedAt: new Date().toISOString(),
          sessionId:  window.__LDS_SESSION_ID__,
      };
  }

  // ── Report assembly ────────────────────────────────────────────────────────
  function _captureDomStats() {
      try {
          const all = document.querySelectorAll('*');
          const counts = {};
          for (var i = 0; i < all.length; i++) {
              const tag = all[i].tagName;
              if (tag.indexOf('-') !== -1) {
                  const t = tag.toLowerCase();
                  counts[t] = (counts[t] || 0) + 1;
              }
          }
          return { totalNodes: all.length, customElements: counts };
      } catch (_e) {
          return null;
      }
  }

  function _collectReport(note = '') {
      const rawMem = window.__LDS_MEMORY__;
      return {
          sessionId:      window.__LDS_SESSION_ID__,
          reportTime:     new Date().toISOString(),
          note:           note || '',
          environment:    _captureEnvironment(),
          errors:         [...(window.__LDS_ERRORS__ || [])],
          perf:           { ...(window.__LDS_PERF__ || {}) },
          eventsTimeline: [...(window.__LDS_EVENTS_TIMELINE__ || [])],
          eventsFreq:     window.__LDS_EVENTS_FREQ__ ? { ...window.__LDS_EVENTS_FREQ__ } : null,
          slowApi:        [...(window.__LDS_SLOW_API_LOG__ || [])],
          memory:         rawMem instanceof Map ? Object.fromEntries(rawMem) : { ...(rawMem || {}) },
          console:        [...(window.__LDS_CONSOLE__ || [])],
          slowRenders:    [...(window.__LDS_SLOW_RENDERS__ || [])],
          storms:         [...(window.__LDS_STORMS__ || [])],
          vitals:         window.__LDS_VITALS__ ? { ...window.__LDS_VITALS__, longTasks: [...(window.__LDS_VITALS__.longTasks || [])] } : null,
          network:        [...(window.__LDS_NETWORK_LOG__ || [])],
          renderReasons:  window.__LDS_RENDER_REASONS__ ? { ...window.__LDS_RENDER_REASONS__ } : null,
          thrash:         [...(window.__LDS_THRASH__ || [])],
          cycles:         [...(window.__LDS_CYCLES__ || [])],
          domStats:       _captureDomStats(),
      };
  }

  // ── Health scoring ─────────────────────────────────────────────────────────
  function _gradeFromScore(score) {
      if (score >= 85) return { grade: 'A', color: '#a6e3a1' };
      if (score >= 70) return { grade: 'B', color: '#94e2d5' };
      if (score >= 55) return { grade: 'C', color: '#f9e2af' };
      if (score >= 40) return { grade: 'D', color: '#fab387' };
      return { grade: 'F', color: '#f38ba8' };
  }

  function _pageHealthScore(report) {
      let score = 100;
      const errors    = report.errors || [];
      const storms    = report.storms || [];
      const vitals    = report.vitals;
      const longTasks = vitals?.longTasks || [];
      const slowApi   = report.slowApi || [];
      const network   = report.network || [];
      const thrash    = report.thrash  || [];
      const cycles    = report.cycles  || [];

      score -= Math.min(errors.length * 20, 60);
      score -= storms.length > 0 ? Math.min(storms.length * 15, 30) : 0;
      score -= Math.min(slowApi.length * 3, 15);
      score -= network.filter(n => n.isError).length > 0 ? 10 : 0;
      score -= Math.min(thrash.length * 5, 20);
      score -= cycles.length > 0 ? Math.min(cycles.length * 15, 30) : 0;

      const domTotal = report.domStats?.totalNodes || 0;
      if (domTotal > 5000) score -= 20; else if (domTotal > 2500) score -= 10; else if (domTotal > 1500) score -= 5;

      if (vitals) {
          const lcp = vitals.lcp?.valueMs;
          if (lcp > 4000) score -= 25; else if (lcp > 2500) score -= 12;
          const cls = vitals.cls?.value;
          if (cls > 0.25) score -= 20; else if (cls > 0.1) score -= 10;
          const inp = vitals.inp?.valueMs;
          if (inp > 500) score -= 20; else if (inp > 200) score -= 10;
      }
      if (longTasks.length > 10) score -= 15; else if (longTasks.length > 5) score -= 8; else if (longTasks.length > 0) score -= 3;

      return Math.max(0, Math.min(100, Math.round(score)));
  }

  function _componentHealthScore(tag, report) {
      let score = 100;
      const hasError   = (report.errors || []).some(e => e.tag === tag);
      const isStorm    = (report.storms || []).some(s => s.tag === tag);
      const perf       = (report.perf || {})[tag];
      const mem        = (report.memory || {})[tag];
      const slowRenders = (report.slowRenders || []).filter(r => r.tag === tag);

      if (hasError) score -= 40;
      if (isStorm)  score -= 30;
      if (slowRenders.length > 0) score -= 20;
      if (perf && perf.count > 0) {
          const avg = perf.totalMs / perf.count;
          if (avg > 500) score -= 25; else if (avg > 200) score -= 12; else if (avg > 100) score -= 5;
      }
      if (mem) {
          const active = (mem.mounted || 0) - (mem.unmounted || 0);
          const leak = active > 3 && (mem.gcCount || 0) < active * 0.5;
          if (leak) score -= 20;
      }
      return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ── Pinpoint issues ────────────────────────────────────────────────────────
  function _buildPinpointIssues(report) {
      const issues = [];

      // Crashes
      const byErrorTag = {};
      (report.errors || []).forEach(e => { (byErrorTag[e.tag] = byErrorTag[e.tag] || []).push(e); });
      Object.entries(byErrorTag).forEach(([tag, errs]) => {
          issues.push({ id: `error-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'runtime-error', severity: 'critical',
              details: errs.map(e => `[${e.phase}] ${e.message}`).join('\n'),
              callStacks: errs.map(e => e.stack).filter(Boolean),
              recommendation: 'Crash caught by LdsErrorBoundary. Inspect the stack trace. Check for null/undefined dereferences in performUpdate() or _propertiesChanged().' });
      });

      // Render storms
      const byStormTag = {};
      (report.storms || []).forEach(s => { (byStormTag[s.tag] = byStormTag[s.tag] || []).push(s); });
      Object.entries(byStormTag).forEach(([tag, incidents]) => {
          const maxCount = Math.max(...incidents.map(i => i.count));
          issues.push({ id: `storm-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'render-storm', severity: 'high',
              details: `<${tag}> mounted ${maxCount}× in session. Storm at: ${incidents.map(i => i.count).join(', ')} mounts.`,
              callStacks: incidents.map(i => i.stack).filter(Boolean),
              recommendation: 'Check parent for property bindings that change on every update (new object/array literals in templates). Verify connectedCallback does not cause re-mount via DOM manipulation.' });
      });

      // Slow render incidents
      const bySlowTag = {};
      (report.slowRenders || []).forEach(r => { (bySlowTag[r.tag] = bySlowTag[r.tag] || []).push(r); });
      Object.entries(bySlowTag).forEach(([tag, incidents]) => {
          const maxMs = Math.max(...incidents.map(i => i.ms));
          issues.push({ id: `slow-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'slow-render', severity: maxMs > 1000 ? 'high' : 'medium',
              details: `${incidents.length} render(s) exceeded 500ms. Max: ${maxMs}ms.`,
              callStacks: incidents.map(i => i.stack).filter(Boolean),
              recommendation: 'Move heavy computation out of render() into updated() or a property setter. Consider lazy loading heavy children.' });
      });

      // High-avg TTI
      Object.entries(report.perf || {}).forEach(([tag, d]) => {
          if (bySlowTag[tag] || d.count < 2) return;
          const avg = Math.round(d.totalMs / d.count);
          if (avg > 200) {
              issues.push({ id: `avg-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'high-avg-tti', severity: avg > 500 ? 'high' : 'medium',
                  details: `Avg TTI: ${avg}ms over ${d.count} renders. Max: ${Math.round(d.maxMs)}ms.`,
                  callStacks: [],
                  recommendation: 'Profile with Chrome DevTools. Enable prop-audit (window.__LDS_PROP_DEBUG__ = "<tag>") to see which properties trigger updates.' });
          }
      });

      // Memory leaks
      Object.entries(report.memory || {}).forEach(([tag, v]) => {
          const active = (v.mounted || 0) - (v.unmounted || 0);
          if (active > 3 && (v.gcCount || 0) < active * 0.5) {
              issues.push({ id: `leak-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'memory-leak', severity: 'high',
                  details: `Mounted: ${v.mounted} | Unmounted: ${v.unmounted} | Active: ${active} | GC freed: ${v.gcCount || 0}.`,
                  callStacks: [],
                  recommendation: 'Check disconnectedCallback: remove all addEventListener(), clearTimeout/clearInterval, cancel event bus subscriptions. Verify no parent stores element references in arrays that outlive navigation.' });
          }
      });

      // Failed network calls
      const failedReqs = (report.network || []).filter(n => n.isError);
      if (failedReqs.length > 0) {
          issues.push({ id: 'network-errors', component: '(network)', filePath: '', issueType: 'network-error', severity: 'high',
              details: failedReqs.map(n => `${n.method} ${n.url} → ${n.status || 'ERR'} (${n.durationMs}ms)`).join('\n'),
              callStacks: [],
              recommendation: 'Check auth tokens, CORS headers, and API availability. 401 → re-login; 403 → permission issue; 5xx → backend problem.' });
      }

      // Property thrash
      const byThrashTag = {};
      (report.thrash || []).forEach(t => {
          if (!byThrashTag[t.tag]) byThrashTag[t.tag] = [];
          byThrashTag[t.tag].push(t);
      });
      Object.entries(byThrashTag).forEach(([tag, incidents]) => {
          const props    = [...new Set(incidents.map(i => i.prop))];
          Math.max(...incidents.map(i => i.count));
          issues.push({ id: `thrash-${tag}`, component: tag, filePath: _tagToFilePath(tag), issueType: 'property-thrash', severity: 'high',
              details: `Property thrash on <${tag}>:\n${incidents.slice(0, 5).map(i => `  .${i.prop} — set ${i.count}× in ${i.windowMs}ms`).join('\n')}\nAffected props: ${props.join(', ')}`,
              callStacks: incidents.map(i => i.stack).filter(Boolean),
              recommendation: 'A property is being set >5× per second — likely a new object/array literal passed on every parent render. Move the value outside the render function or use a stable reference.' });
      });

      // Circular updates
      (report.cycles || []).forEach((c, idx) => {
          const tags    = c.path.split(' → ');
          const rootTag = tags[0] || '(unknown)';
          issues.push({ id: `cycle-${idx}`, component: rootTag, filePath: _tagToFilePath(rootTag), issueType: 'circular-update', severity: 'critical',
              details: `Circular update chain detected (${c.count}×):\n  ${c.path}${c.prop ? `\n  Triggered on prop: .${c.prop}` : ''}`,
              callStacks: c.stack ? [c.stack] : [],
              recommendation: 'An element\'s updated() or setter is setting a property on a component that eventually sets a property back on it. Break the cycle: use a guard (if this._updating return), memoize values, or restructure data flow so updates are unidirectional.' });
      });

      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return issues.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  }

  // ── R3-B History diff ─────────────────────────────────────────────────────
  function _buildDiff(aReport = {}, bReport = {}) {
      const _num = v => typeof v === 'number' ? v : 0;
      const _avg = perf => {
          const vals = Object.values(perf || {});
          if (!vals.length) return 0;
          const total = vals.reduce((s, d) => s + (d.count > 0 ? d.totalMs / d.count : 0), 0);
          return Math.round(total / vals.length);
      };

      const aErrors  = _num((aReport.errors || []).length);
      const bErrors  = _num((bReport.errors || []).length);
      const aStorms  = _num((aReport.storms || []).length);
      const bStorms  = _num((bReport.storms || []).length);
      const aNetFail = _num((aReport.network || []).filter(n => n.isError).length);
      const bNetFail = _num((bReport.network || []).filter(n => n.isError).length);
      const aAvgTti  = _avg(aReport.perf);
      const bAvgTti  = _avg(bReport.perf);
      const aScore   = _pageHealthScore(aReport);
      const bScore   = _pageHealthScore(bReport);
      const aDomNodes = _num(aReport.domStats?.totalNodes);
      const bDomNodes = _num(bReport.domStats?.totalNodes);

      const _dir   = (a, b, lowerIsBetter = true) =>
          a === b ? 'same' : (lowerIsBetter ? (b < a ? 'better' : 'worse') : (b > a ? 'better' : 'worse'));
      const _delta = (a, b) => {
          if (a === 0 && b === 0) return '';
          const d = b - a;
          return (d > 0 ? '+' : '') + d;
      };

      const metrics = [
          { label: 'Health Score',     aVal: aScore,         bVal: bScore,         dir: _dir(aScore, bScore, false), delta: _delta(aScore, bScore) },
          { label: 'Crashes',          aVal: aErrors,        bVal: bErrors,        dir: _dir(aErrors, bErrors),      delta: _delta(aErrors, bErrors) },
          { label: 'Render Storms',    aVal: aStorms,        bVal: bStorms,        dir: _dir(aStorms, bStorms),      delta: _delta(aStorms, bStorms) },
          { label: 'Network Failures', aVal: aNetFail,       bVal: bNetFail,       dir: _dir(aNetFail, bNetFail),    delta: _delta(aNetFail, bNetFail) },
          { label: 'Avg Render (ms)',  aVal: aAvgTti + 'ms', bVal: bAvgTti + 'ms', dir: _dir(aAvgTti, bAvgTti),     delta: _delta(aAvgTti, bAvgTti) + 'ms' },
          { label: 'DOM Nodes',        aVal: aDomNodes,      bVal: bDomNodes,      dir: _dir(aDomNodes, bDomNodes),  delta: _delta(aDomNodes, bDomNodes) },
      ];

      const aIssueIds  = new Set(_buildPinpointIssues(aReport).map(i => i.id));
      const bIssues    = _buildPinpointIssues(bReport);
      const newIssues  = bIssues.filter(i => !aIssueIds.has(i.id));
      const bIssueIds  = new Set(bIssues.map(i => i.id));
      const aIssues    = _buildPinpointIssues(aReport);
      const fixedIssues = aIssues.filter(i => !bIssueIds.has(i.id));

      const aTags = new Set(Object.keys(aReport.perf || {}));
      const bTags = new Set(Object.keys(bReport.perf || {}));
      const newComponents     = [...bTags].filter(t => !aTags.has(t));
      const removedComponents = [...aTags].filter(t => !bTags.has(t));

      return { metrics, newIssues, fixedIssues, newComponents, removedComponents };
  }

  // ── Anomaly findings ───────────────────────────────────────────────────────
  function _computeFindings(report) {
      const findings = [];
      const errorCount = (report.errors || []).length;
      if (errorCount > 0) findings.push({ severity: 'critical', icon: '🔴', text: `${errorCount} crash${errorCount > 1 ? 'es' : ''} caught by ErrorBoundary` });
      const failedNet = (report.network || []).filter(n => n.isError).length;
      if (failedNet > 0) findings.push({ severity: 'critical', icon: '🔴', text: `${failedNet} failed network request${failedNet > 1 ? 's' : ''}` });
      const storms = report.storms || [];
      if (storms.length > 0) { const worst = storms.reduce((a, b) => a.count > b.count ? a : b); findings.push({ severity: 'high', icon: '🔁', text: `Render storm: <${worst.tag}> mounted ${worst.count}×` }); }
      const slowApis = report.slowApi || [];
      if (slowApis.length > 0) { const maxMs = Math.max(...slowApis.map(e => e.durationMs || e.duration || e.ms || 0)); findings.push({ severity: 'high', icon: '🟠', text: `${slowApis.length} API call${slowApis.length > 1 ? 's' : ''} over threshold (max ${maxMs}ms)` }); }
      const v = report.vitals;
      if (v?.lcp?.valueMs > 4000) findings.push({ severity: 'high', icon: '🟠', text: `LCP ${v.lcp.valueMs}ms (poor — threshold 2500ms)` });
      else if (v?.lcp?.valueMs > 2500) findings.push({ severity: 'medium', icon: '🟡', text: `LCP ${v.lcp.valueMs}ms (needs improvement)` });
      if (v?.inp?.valueMs > 500) findings.push({ severity: 'high', icon: '🟠', text: `INP ${v.inp.valueMs}ms (poor — threshold 200ms)` });
      if (v?.cls?.value > 0.1) findings.push({ severity: 'medium', icon: '🟡', text: `CLS ${v.cls.value.toFixed(3)} (threshold 0.1)` });
      const ltCount = (v?.longTasks || []).length;
      if (ltCount > 5) findings.push({ severity: 'medium', icon: '🟡', text: `${ltCount} long task${ltCount > 1 ? 's' : ''} (>50ms main thread blocks)` });
      const slowTags = Object.entries(report.perf || {}).filter(([, d]) => d.count > 0 && d.totalMs / d.count > 500).sort((a, b) => b[1].totalMs / b[1].count - a[1].totalMs / a[1].count);
      if (slowTags.length > 0) { const [tag, d] = slowTags[0]; findings.push({ severity: 'medium', icon: '🟡', text: `<${tag}> avg render ${Math.round(d.totalMs / d.count)}ms${slowTags.length > 1 ? ` +${slowTags.length - 1} more` : ''}` }); }
      const conErrors = (report.console || []).filter(e => e.level === 'error').length;
      if (conErrors > 0) findings.push({ severity: 'medium', icon: '⚠️', text: `${conErrors} console error${conErrors > 1 ? 's' : ''}` });
      const thrash = report.thrash || [];
      if (thrash.length > 0) {
          const tags = [...new Set(thrash.map(t => t.tag))];
          findings.push({ severity: 'high', icon: '🔄', text: `Property thrash: ${thrash.length} incident${thrash.length > 1 ? 's' : ''} on ${tags.slice(0, 2).map(t => `<${t}>`).join(', ')}${tags.length > 2 ? ` +${tags.length - 2} more` : ''}` });
      }
      const cycles = report.cycles || [];
      if (cycles.length > 0) {
          findings.push({ severity: 'critical', icon: '🔁', text: `${cycles.length} circular update chain${cycles.length > 1 ? 's' : ''} detected` });
      }
      const domNodes = report.domStats?.totalNodes || 0;
      if (domNodes > 5000) findings.push({ severity: 'high', icon: '🌳', text: `DOM is very large: ${domNodes.toLocaleString()} nodes (threshold 1500)` });
      else if (domNodes > 1500) findings.push({ severity: 'medium', icon: '🌳', text: `DOM has ${domNodes.toLocaleString()} nodes — consider virtualising long lists` });
      if (findings.length === 0) findings.push({ severity: 'ok', icon: '✅', text: 'No anomalies detected' });
      return findings;
  }

  // ── HTML report generator ──────────────────────────────────────────────────
  function _buildHtmlReport(report, note) {
      const score = _pageHealthScore(report);
      const { grade, color: gradeColor } = _gradeFromScore(score);
      const findings = _computeFindings(report);
      const issues   = _buildPinpointIssues(report);
      const env      = report.environment || {};

      const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const rowsHtml = (cols, rows) =>
          `<table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
            rows.map(r => `<tr>${r.map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')
        }</tbody></table>`;

      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LDS Debug Report — ${escHtml(report.reportTime?.slice(0,19) || '')}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Consolas,Menlo,Monaco,monospace;font-size:12px;background:#1e1e2e;color:#cdd6f4;padding:20px}
h1{font-size:20px;color:#89b4fa;margin-bottom:4px}
h2{font-size:14px;color:#89b4fa;margin:18px 0 8px;border-bottom:1px solid #313244;padding-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
.meta{color:#6c7086;font-size:11px;margin-bottom:16px}
.grade{display:inline-block;font-size:48px;font-weight:bold;color:${gradeColor};line-height:1;vertical-align:middle}
.score{display:inline-block;font-size:20px;color:${gradeColor};vertical-align:middle;margin-left:8px}
.grade-block{background:#181825;border:1px solid #313244;border-radius:8px;padding:12px 20px;display:inline-flex;align-items:center;gap:12px;margin-bottom:16px}
.finding{display:flex;gap:8px;padding:6px 10px;border-radius:4px;margin-bottom:5px;background:#181825;border-left:3px solid #313244}
.finding.critical{border-left-color:#f38ba8}.finding.high{border-left-color:#fab387}.finding.medium{border-left-color:#f9e2af}.finding.ok{border-left-color:#a6e3a1}
.note-box{background:#1e2a1e;border:1px solid #a6e3a1;border-radius:6px;padding:10px;margin-bottom:16px;color:#a6e3a1}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px}
th{text-align:left;color:#6c7086;font-weight:normal;padding:4px 6px;border-bottom:1px solid #313244;background:#181825}
td{padding:4px 6px;border-bottom:1px solid #1a1a28;vertical-align:top;word-break:break-word}
.err{color:#f38ba8}.warn{color:#f9e2af}
details{margin-bottom:10px}
summary{cursor:pointer;color:#89b4fa;padding:6px 0;font-size:12px;user-select:none}
.issue{background:#181825;border:1px solid #313244;border-radius:6px;margin-bottom:8px;overflow:hidden}
.issue-hdr{display:flex;gap:8px;padding:8px 12px;align-items:flex-start}
.sev{border-radius:3px;padding:2px 6px;font-size:10px;font-weight:bold}
.sev.critical{background:#f38ba8;color:#1e1e2e}.sev.high{background:#fab387;color:#1e1e2e}.sev.medium{background:#f9e2af;color:#1e1e2e}
.issue-body{padding:8px 12px;border-top:1px solid #313244;font-size:11px}
.rec{color:#a6e3a1;background:#0d1f0d;padding:6px 8px;border-radius:4px;border-left:2px solid #a6e3a1;margin:6px 0}
pre{background:#13131f;color:#cba6f7;padding:8px;border-radius:4px;overflow-x:auto;font-size:10px;white-space:pre;max-height:200px;overflow-y:auto}
.kv{display:flex;gap:12px;padding:3px 0;border-bottom:1px solid #1a1a28}
.kv-k{color:#89b4fa;min-width:140px;flex-shrink:0}.kv-v{color:#cdd6f4;overflow-wrap:anywhere}
.section{margin-bottom:20px}
</style>
</head>
<body>
<h1>🐞 LDS Debug Report</h1>
<div class="meta">Session: ${escHtml(report.sessionId)} &nbsp;|&nbsp; ${escHtml(report.reportTime?.slice(0,19) || '')} &nbsp;|&nbsp; ${escHtml(env.browser?.version || '')} &nbsp;|&nbsp; ${escHtml(env.url || '')}</div>

${note ? `<div class="note-box">📝 Note: ${escHtml(note)}</div>` : ''}

<div class="grade-block">
  <div><div style="color:#6c7086;font-size:11px">Page Health</div><div><span class="grade">${grade}</span><span class="score">${score}/100</span></div></div>
</div>

<div class="section">
<h2>Findings</h2>
${findings.map(f => `<div class="finding ${f.severity}">${f.icon} ${escHtml(f.text)}</div>`).join('')}
</div>

${issues.length > 0 ? `<div class="section">
<h2>Pinpoint Issues</h2>
${issues.map(i => `<div class="issue">
<div class="issue-hdr"><span class="sev ${i.severity}">${i.severity.toUpperCase()}</span><div><strong style="color:#89b4fa">&lt;${escHtml(i.component)}&gt;</strong> <span style="color:#6c7086">${escHtml(i.issueType)}</span><br><span style="color:#a6e3a1;font-size:10px">${escHtml(i.filePath)}</span></div></div>
<div class="issue-body"><div style="margin-bottom:6px;white-space:pre-wrap">${escHtml(i.details)}</div><div class="rec">💡 ${escHtml(i.recommendation)}</div>${
    i.callStacks?.length > 0 ? i.callStacks.slice(0,2).map((s,idx) => `<details><summary>Call stack #${idx+1}</summary><pre>${escHtml(_filterAppStack(s))}</pre></details>`).join('') : ''
}</div></div>`).join('')}
</div>` : ''}

${Object.keys(report.perf || {}).length > 0 ? `<details><summary>▶ Performance (${Object.keys(report.perf).length} components)</summary>
${rowsHtml(['Component','Renders','Avg ms','Max ms','Min ms'],
    Object.entries(report.perf).sort((a,b)=>b[1].totalMs/b[1].count - a[1].totalMs/a[1].count)
        .map(([tag,d])=>[`<${tag}>`, d.count, Math.round(d.totalMs/d.count), Math.round(d.maxMs), d.minMs===Infinity?'-':Math.round(d.minMs)])
)}
</details>` : ''}

${report.network?.length > 0 ? `<details><summary>▶ Network (${report.network.length} requests)</summary>
${rowsHtml(['Method','URL / Decoded','Status','ms','KB'],
    report.network.slice(-50).reverse().map(n=>{
        const dc  = n.decoded;
        const url = dc
            ? `<span style="color:#cba6f7">${escHtml(dc.operation||dc.method)}${dc.domain?` · ${escHtml(dc.domain)}`:''}</span><br><span style="font-size:10px">${escHtml(dc.callPath||'')}</span>${dc.types?`<br><span style="font-size:9px;color:#a6e3a1">[${dc.types.slice(0,3).join(', ')}]</span>`:''}`
            : `<span class="${n.isError?'err':n.isSlow?'warn':''}">${escHtml(n.url)}</span>`;
        return [n.method, url, `<span class="${n.isError?'err':''}">${n.status||'ERR'}</span>`,
            n.isError?`<span class="err">${n.durationMs}</span>`:n.isSlow?`<span class="warn">${n.durationMs}</span>`:n.durationMs,
            n.responseSizeKB||'-'];
    })
)}
</details>` : ''}

${report.domStats ? `<details><summary>▶ DOM Size${report.domStats.totalNodes > 1500 ? ' ⚠️' : ''}</summary>
<div class="kv"><span class="kv-k">Total Nodes</span><span class="kv-v" style="${report.domStats.totalNodes > 5000 ? 'color:#f38ba8' : report.domStats.totalNodes > 1500 ? 'color:#fab387' : ''}">${report.domStats.totalNodes.toLocaleString()}</span></div>
${report.domStats.customElements && Object.keys(report.domStats.customElements).length > 0
    ? rowsHtml(['Tag','Count'],
        Object.entries(report.domStats.customElements).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([tag,count])=>[`<${tag}>`,count]))
    : ''}
</details>` : ''}

${report.thrash?.length > 0 ? `<details><summary>▶ Property Thrash (${report.thrash.length} incidents)</summary>
${rowsHtml(['Component','Property','Count','Window ms','Time'],
    report.thrash.map(t=>[`<${t.tag}>`, t.prop, t.count, t.windowMs, (t.ts||'').slice(11,19)])
)}
</details>` : ''}

${report.cycles?.length > 0 ? `<details><summary>▶ Circular Updates (${report.cycles.length} chains)</summary>
${rowsHtml(['Cycle Path','Count','Prop','First seen'],
    report.cycles.map(c=>[escHtml(c.path), c.count, c.prop||'—', (c.ts||'').slice(11,19)])
)}
</details>` : ''}

${report.vitals ? `<details><summary>▶ Core Web Vitals</summary>
<div class="kv"><span class="kv-k">LCP</span><span class="kv-v">${report.vitals.lcp ? `${report.vitals.lcp.valueMs}ms (element: ${report.vitals.lcp.element})` : 'not captured'}</span></div>
<div class="kv"><span class="kv-k">CLS</span><span class="kv-v">${report.vitals.cls ? report.vitals.cls.value.toFixed(4) : 'not captured'}</span></div>
<div class="kv"><span class="kv-k">INP/FID</span><span class="kv-v">${report.vitals.inp ? `${report.vitals.inp.valueMs}ms` : 'not captured'}</span></div>
<div class="kv"><span class="kv-k">Long Tasks</span><span class="kv-v">${(report.vitals.longTasks||[]).length} task(s) >50ms</span></div>
</details>` : ''}

${report.errors?.length > 0 ? `<details><summary>▶ Crashes (${report.errors.length})</summary>
${rowsHtml(['Component','Phase','Message','Time'],
    report.errors.map(e=>[`<${e.tag}>`,e.phase,e.message,(e.ts||'').slice(11,19)])
)}
</details>` : ''}

${report.console?.length > 0 ? `<details><summary>▶ Console (${report.console.length} entries)</summary>
${rowsHtml(['Level','Message','Time'],
    report.console.slice().reverse().map(e=>[`<span class="${e.level==='error'?'err':'warn'}">${e.level}</span>`,e.message,(e.ts||'').slice(11,19)])
)}
</details>` : ''}

${Object.keys(report.memory||{}).length > 0 ? `<details><summary>▶ Memory</summary>
${rowsHtml(['Component','Mounted','Unmounted','Active','GC freed'],
    Object.entries(report.memory).sort((a,b)=>b[1].mounted-a[1].mounted)
        .map(([tag,v])=>[`<${tag}>`,v.mounted??0,v.unmounted??0,(v.mounted||0)-(v.unmounted||0),v.gcCount??0])
)}
</details>` : ''}

${report.environment ? `<details><summary>▶ Environment</summary>
<div class="kv"><span class="kv-k">Browser</span><span class="kv-v">${escHtml(env.browser?.version)}</span></div>
<div class="kv"><span class="kv-k">URL</span><span class="kv-v">${escHtml(env.url)}</span></div>
</details>` : ''}

<details><summary>▶ Raw JSON</summary>
<pre style="max-height:400px">${escHtml(JSON.stringify(report, null, 2))}</pre>
</details>
</body>
</html>`;
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS = [
      { key: 'summary',  label: 'Summary' },
      { key: 'pinpoint', label: '🔍 Pinpoint' },
      { key: 'vitals',   label: 'Vitals' },
      { key: 'network',  label: 'Network' },
      { key: 'perf',     label: 'Perf' },
      { key: 'errors',   label: 'Errors' },
      { key: 'console',  label: 'Console' },
      { key: 'events',   label: 'Events' },
      { key: 'slowapi',  label: 'Slow API' },
      { key: 'memory',   label: 'Memory' },
      { key: 'history',  label: '📋 History' },
      { key: 'env',      label: 'Env' },
  ];

  class LdsDebugPanel extends i {
      static get styles() {
          return i$3`
            :host { display:block; font-family:'Consolas','Menlo','Monaco',monospace; font-size:12px; }

            .trigger { position:fixed; bottom:20px; right:20px; z-index:99998; width:44px; height:44px; border-radius:50%; border:none; background:#1e1e2e; color:#cdd6f4; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 12px rgba(0,0,0,.5); transition:transform .15s ease; outline:2px solid #313244; }
            .trigger:hover { transform:scale(1.1); }
            .trigger.has-errors { outline-color:#f38ba8; }
            .badge { position:absolute; top:-4px; right:-4px; background:#f38ba8; color:#1e1e2e; border-radius:9px; min-width:18px; height:18px; font-size:10px; font-weight:bold; display:flex; align-items:center; justify-content:center; padding:0 4px; }

            .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:99998; }

            .panel { position:fixed; top:0; right:0; bottom:0; width:540px; max-width:100vw; z-index:99999; background:#1e1e2e; color:#cdd6f4; display:flex; flex-direction:column; box-shadow:-4px 0 24px rgba(0,0,0,.6); }

            .panel-header { background:#13131f; padding:10px 14px; display:flex; align-items:center; gap:6px; border-bottom:1px solid #313244; flex-shrink:0; flex-wrap:wrap; }
            .panel-title { font-size:14px; font-weight:bold; color:#89b4fa; white-space:nowrap; }
            .session-id { flex:1; color:#6c7086; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
            .mode-badge { background:#45475a; color:#cba6f7; border-radius:4px; padding:2px 7px; font-size:10px; font-weight:bold; white-space:nowrap; flex-shrink:0; }
            .mode-badge.imported { background:#1e3a5f; color:#89b4fa; }
            .mode-badge.history  { background:#2a1e3f; color:#cba6f7; }
            .header-btn { background:#313244; border:none; color:#cdd6f4; border-radius:4px; padding:4px 8px; cursor:pointer; font-size:11px; white-space:nowrap; flex-shrink:0; font-family:inherit; }
            .header-btn:hover { background:#45475a; }
            .header-btn.close { color:#f38ba8; }
            .header-btn.accent { color:#89b4fa; }
            .header-btn.live-btn { color:#a6e3a1; }

            .note-row { padding:6px 14px; background:#0d1f0d; border-bottom:1px solid #313244; flex-shrink:0; display:flex; align-items:center; gap:8px; }
            .note-input { flex:1; background:#13131f; border:1px solid #313244; color:#cdd6f4; border-radius:4px; padding:4px 8px; font-family:inherit; font-size:11px; resize:none; outline:none; }
            .note-input:focus { border-color:#89b4fa; }
            .note-label { color:#6c7086; font-size:10px; white-space:nowrap; }

            .tabs { display:flex; background:#181825; border-bottom:1px solid #313244; overflow-x:auto; flex-shrink:0; }
            .tabs::-webkit-scrollbar { height:3px; }
            .tabs::-webkit-scrollbar-thumb { background:#45475a; }
            .tab { background:none; border:none; color:#6c7086; padding:8px 12px; cursor:pointer; font-size:11px; font-family:inherit; white-space:nowrap; border-bottom:2px solid transparent; transition:color .1s; }
            .tab:hover { color:#cdd6f4; }
            .tab.active { color:#89b4fa; border-bottom-color:#89b4fa; }

            .tab-content { flex:1; overflow-y:auto; padding:12px; }
            .tab-content::-webkit-scrollbar { width:5px; }
            .tab-content::-webkit-scrollbar-thumb { background:#45475a; border-radius:3px; }

            .empty { color:#6c7086; padding:24px 0; text-align:center; }

            .finding { display:flex; gap:8px; padding:7px 10px; border-radius:6px; margin-bottom:6px; background:#181825; border-left:3px solid #313244; font-size:12px; }
            .finding.critical { border-left-color:#f38ba8; } .finding.high { border-left-color:#fab387; } .finding.medium { border-left-color:#f9e2af; } .finding.ok { border-left-color:#a6e3a1; }

            table { width:100%; border-collapse:collapse; font-size:11px; }
            th { text-align:left; color:#6c7086; font-weight:normal; padding:4px 6px; border-bottom:1px solid #313244; position:sticky; top:0; background:#1e1e2e; }
            td { padding:5px 6px; border-bottom:1px solid #1a1a28; vertical-align:top; word-break:break-word; }
            tr:hover td { background:#181825; }
            .slow { color:#f38ba8; } .warn-cell { color:#f9e2af; }

            .log-entry { display:flex; gap:8px; padding:5px 0; border-bottom:1px solid #1a1a28; align-items:flex-start; }
            .level-badge { border-radius:3px; padding:1px 5px; font-size:10px; font-weight:bold; flex-shrink:0; margin-top:1px; }
            .level-badge.error { background:#f38ba8; color:#1e1e2e; } .level-badge.warn { background:#f9e2af; color:#1e1e2e; }
            .log-msg { flex:1; color:#cdd6f4; overflow-wrap:anywhere; }
            .log-ts { color:#6c7086; font-size:10px; flex-shrink:0; }

            .kv-row { display:flex; gap:12px; padding:4px 0; border-bottom:1px solid #1a1a28; }
            .kv-key { color:#89b4fa; min-width:140px; flex-shrink:0; } .kv-value { color:#cdd6f4; overflow-wrap:anywhere; }

            .section-title { color:#89b4fa; font-size:11px; letter-spacing:.05em; text-transform:uppercase; margin:14px 0 6px; }
            .section-title:first-child { margin-top:0; }

            .stats-row { display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
            .stat-chip { background:#181825; border:1px solid #313244; border-radius:6px; padding:6px 12px; text-align:center; }
            .stat-chip .num { font-size:20px; color:#89b4fa; font-weight:bold; }
            .stat-chip .lbl { color:#6c7086; font-size:10px; }

            .health-grade { display:inline-block; font-size:36px; font-weight:bold; line-height:1; }
            .health-block { background:#181825; border:1px solid #313244; border-radius:8px; padding:10px 16px; display:inline-flex; align-items:center; gap:10px; margin-bottom:14px; }
            .health-meta { color:#6c7086; font-size:10px; }
            .health-score { font-size:16px; font-weight:bold; }

            .issue-card { background:#181825; border:1px solid #313244; border-radius:6px; margin-bottom:10px; overflow:hidden; }
            .issue-header { display:flex; align-items:flex-start; gap:8px; padding:9px 12px; cursor:pointer; user-select:none; }
            .issue-header:hover { background:#1e1e35; }
            .issue-sev { border-radius:3px; padding:2px 6px; font-size:10px; font-weight:bold; flex-shrink:0; margin-top:1px; }
            .issue-sev.critical { background:#f38ba8; color:#1e1e2e; } .issue-sev.high { background:#fab387; color:#1e1e2e; } .issue-sev.medium { background:#f9e2af; color:#1e1e2e; }
            .issue-info { flex:1; min-width:0; }
            .issue-component { color:#89b4fa; font-weight:bold; }
            .issue-type { color:#6c7086; font-size:10px; margin-left:6px; }
            .issue-filepath { color:#a6e3a1; font-size:10px; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .issue-body { padding:0 12px 10px; border-top:1px solid #313244; }
            .issue-details { color:#cdd6f4; margin:8px 0; font-size:11px; white-space:pre-wrap; }
            .issue-rec { color:#a6e3a1; font-size:11px; margin:6px 0; padding:6px 8px; background:#0d1f0d; border-radius:4px; border-left:2px solid #a6e3a1; }
            .stack-toggle { background:none; border:1px solid #313244; color:#6c7086; border-radius:3px; padding:2px 8px; cursor:pointer; font-size:10px; font-family:inherit; margin:4px 0; }
            .stack-toggle:hover { color:#cdd6f4; border-color:#45475a; }
            .stack-pre { background:#13131f; color:#cba6f7; font-size:10px; padding:8px; border-radius:4px; overflow-x:auto; white-space:pre; margin-top:4px; max-height:200px; overflow-y:auto; }
            .filter-bar { display:flex; gap:8px; margin-bottom:10px; align-items:center; flex-wrap:wrap; }
            .filter-select { background:#313244; border:none; color:#cdd6f4; border-radius:4px; padding:4px 8px; font-size:11px; font-family:inherit; cursor:pointer; }
            .filter-input { background:#313244; border:1px solid #45475a; color:#cdd6f4; border-radius:4px; padding:4px 8px; font-size:11px; font-family:inherit; flex:1; min-width:120px; outline:none; }
            .filter-input:focus { border-color:#89b4fa; }
            .stack-filter-toggle { background:#1e2a3a; border:1px solid #313244; color:#89b4fa; border-radius:4px; padding:3px 8px; cursor:pointer; font-size:10px; font-family:inherit; }

            .history-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
            .source-pill { display:inline-block; border-radius:10px; padding:1px 7px; font-size:10px; font-weight:bold; }
            .source-pill.live { background:#1e3a1e; color:#a6e3a1; } .source-pill.download { background:#1e2a3a; color:#89b4fa; } .source-pill.imported { background:#2a1e3f; color:#cba6f7; }
            .viewing-row td { background:#1e1e35 !important; }

            .reason-row td { background:#13131f !important; }
            .freq-hot { color:#f38ba8; font-weight:bold; }

            .net-expand { background:#13131f; border-top:1px solid #313244; padding:10px 14px; }
            .net-kv-key { color:#89b4fa; min-width:130px; flex-shrink:0; font-size:11px; }
            .net-kv-val { color:#cdd6f4; font-size:11px; overflow-wrap:anywhere; flex:1; }
            .decoded-section { margin-bottom:10px; }
            .decoded-header { color:#cba6f7; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
            .tag-pill { display:inline-block; background:#1e2a3a; color:#89b4fa; border-radius:10px; padding:1px 7px; font-size:10px; margin:1px 2px; }

            .diff-better { color:#a6e3a1; } .diff-worse { color:#f38ba8; } .diff-same { color:#6c7086; }

            .vital-card { background:#181825; border:1px solid #313244; border-radius:6px; padding:10px 14px; margin-bottom:8px; display:flex; gap:14px; align-items:center; }
            .vital-val { font-size:28px; font-weight:bold; min-width:80px; }
            .vital-info { flex:1; }
            .vital-name { font-size:12px; font-weight:bold; color:#cdd6f4; }
            .vital-desc { font-size:10px; color:#6c7086; margin-top:2px; }
            .vital-good { color:#a6e3a1; } .vital-needs { color:#f9e2af; } .vital-poor { color:#f38ba8; }
        `;
      }

      static get properties() {
          return {
              _open:            { state: true },
              _tab:             { state: true },
              _report:          { state: true },
              _activeReport:    { state: true },
              _reportNote:      { state: true },
              _stackFilterOn:   { state: true },
              _expandedIssue:   { state: true },
              _expandedStacks:  { state: true },
              _consoleFilter:   { state: true },
              _errorFilter:     { state: true },
              _networkFilter:   { state: true },
              _eventsView:      { state: true },
              _expandedPerfTag: { state: true },
              _expandedNetIdx:  { state: true },
              _diffSelected:    { state: true },
              _diffView:        { state: true },
          };
      }

      constructor() {
          super();
          this._open            = false;
          this._tab             = 'summary';
          this._report          = null;
          this._activeReport    = null;
          this._reportNote      = '';
          this._stackFilterOn   = true;
          this._expandedIssue   = null;
          this._expandedStacks  = {};
          this._consoleFilter   = { level: 'all', search: '' };
          this._errorFilter     = { search: '' };
          this._networkFilter   = { status: 'all', search: '' };
          this._eventsView      = 'timeline';
          this._expandedPerfTag = null;
          this._expandedNetIdx  = null;
          this._diffSelected    = new Set();
          this._diffView        = null;
      }

      _getActiveReport() { return this._activeReport ?? this._report; }
      _isHistoryMode()   { return this._activeReport !== null; }

      _togglePanel() { this._open = !this._open; if (this._open) this._refresh(); }
      _closePanel()  { this._open = false; }

      _refresh() {
          if (this._report) _saveToHistory(this._report, 'live');
          this._report = _collectReport(this._reportNote);
      }

      _backToLive() { this._activeReport = null; this._tab = 'summary'; }
      _setTab(key)  { this._tab = key; }

      _applyStack(stack) {
          return this._stackFilterOn ? _filterAppStack(stack) : (stack || '');
      }

      _download() {
          const report = _collectReport(this._reportNote);
          _saveToHistory(report, 'download');
          const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
          this._triggerBlob(blob, `lds-report-${Date.now()}.json`);
      }

      _downloadHtml() {
          const report = _collectReport(this._reportNote);
          _saveToHistory(report, 'download');
          const html = _buildHtmlReport(report, this._reportNote);
          const blob = new Blob([html], { type: 'text/html' });
          this._triggerBlob(blob, `lds-report-${Date.now()}.html`);
      }

      _triggerBlob(blob, filename) {
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      }

      _triggerImport() { this.shadowRoot.querySelector('#lds-import-input').click(); }

      async _onImportFile(e) {
          const file = e.target.files[0];
          if (!file) return;
          try {
              const text   = await file.text();
              const report = JSON.parse(text);
              if (!report.sessionId && !report.reportTime) { alert('Invalid LDS report file'); return; }
              _saveToHistory(report, 'imported');
              this._activeReport = report;
              this._tab = 'summary';
          } catch (err) { alert(`Failed to parse: ${err.message}`); }
          e.target.value = '';
      }

      _viewHistoryItem(item) { this._activeReport = item.report; this._tab = 'summary'; }
      _clearHistory() { if (window.__LDS_HISTORY__) window.__LDS_HISTORY__.length = 0; this._activeReport = null; this.requestUpdate(); }

      _exportFixTable() {
          const r = this._getActiveReport();
          if (!r) return;
          const issues       = _buildPinpointIssues(r);
          const eventsTimeline = r.eventsTimeline || [];
          const table = issues.map(i => {
              const rawStack      = (i.callStacks || [])[0] || null;
              const filteredStack = rawStack ? _filterAppStack(rawStack) : null;
              const lineNumber    = _extractLineNumber(filteredStack || rawStack);
              const related       = _findRelatedComponents(i.component, eventsTimeline);

              const readHint = lineNumber
                  ? `Read ${i.filePath} lines ${Math.max(1, lineNumber - 10)} to ${lineNumber + 10} for context`
                  : `Read ${i.filePath}`;

              const claudePrompt = [
                  `Fix a ${i.severity} ${i.issueType} issue in <${i.component}>.`,
                  `File: ${i.filePath}${lineNumber ? ` (around line ${lineNumber})` : ''}.`,
                  i.details.split('\n')[0],
                  `Recommendation: ${i.recommendation}`,
                  related.length ? `Related components (via events): ${related.join(', ')}.` : '',
              ].filter(Boolean).join(' ');

              return {
                  id:                i.id,
                  component:         i.component,
                  filePath:          i.filePath,
                  issueType:         i.issueType,
                  severity:          i.severity,
                  details:           i.details,
                  recommendation:    i.recommendation,
                  lineNumber,
                  readHint,
                  relatedComponents: related,
                  claudePrompt,
                  filteredCallStack: filteredStack,
                  callStack:         rawStack,
                  reportedAt:        r.reportTime,
                  sessionId:         r.sessionId,
              };
          });
          const blob = new Blob([JSON.stringify(table, null, 2)], { type: 'application/json' });
          this._triggerBlob(blob, `lds-fix-table-${Date.now()}.json`);
      }

      // ── Render ─────────────────────────────────────────────────────────────
      render() {
          const errorCount = (window.__LDS_ERRORS__ || []).length;
          return b`
            <input id="lds-import-input" type="file" accept=".json" style="display:none" @change=${this._onImportFile}>
            <button class="trigger${errorCount > 0 ? ' has-errors' : ''}" title="LDS Debug Panel" @click=${this._togglePanel}>
                🐞${errorCount > 0 ? b`<span class="badge">${errorCount}</span>` : ''}
            </button>
            ${this._open ? b`
                <div class="backdrop" @click=${this._closePanel}></div>
                <div class="panel">
                    ${this._renderHeader()}
                    ${this._renderNoteRow()}
                    ${this._renderTabs()}
                    ${this._renderContent()}
                </div>` : ''}
        `;
      }

      _renderHeader() {
          const isHistory = this._isHistoryMode();
          const source    = isHistory ? (window.__LDS_HISTORY__||[]).find(h => h.report === this._activeReport)?.source || 'history' : null;
          return b`
            <div class="panel-header">
                <span class="panel-title">🐞 LDS Debug</span>
                ${isHistory
                    ? b`<span class="mode-badge ${source==='imported'?'imported':'history'}">${source==='imported'?'📥 IMPORTED':'📋 HISTORY'}</span>`
                    : b`<span class="session-id" title="${window.__LDS_SESSION_ID__}">${window.__LDS_SESSION_ID__}</span>`}
                ${isHistory
                    ? b`<button class="header-btn live-btn" @click=${this._backToLive}>↩ Live</button>`
                    : b`<button class="header-btn" @click=${this._refresh}>↻ Refresh</button>`}
                <button class="header-btn accent" @click=${this._triggerImport}>📥 Import</button>
                <button class="header-btn" @click=${this._download}>⬇ JSON</button>
                <button class="header-btn accent" @click=${this._downloadHtml}>📄 HTML</button>
                <button class="header-btn close" @click=${this._closePanel}>✕</button>
            </div>`;
      }

      _renderNoteRow() {
          return b`
            <div class="note-row">
                <span class="note-label">📝 Note:</span>
                <textarea class="note-input" rows="1" placeholder="Add context before downloading (e.g. 'happened on save')"
                    .value=${this._reportNote}
                    @input=${e => { this._reportNote = e.target.value; }}></textarea>
            </div>`;
      }

      _renderTabs() {
          return b`
            <div class="tabs">
                ${TABS.map(t => b`<button class="tab${this._tab===t.key?' active':''}" @click=${()=>this._setTab(t.key)}>${t.label}</button>`)}
            </div>`;
      }

      _renderContent() {
          if (!this._report && !this._activeReport) return b`<div class="tab-content"><p class="empty">Loading…</p></div>`;
          const map = {
              summary:  this._renderSummary,
              pinpoint: this._renderPinpoint,
              vitals:   this._renderVitals,
              network:  this._renderNetwork,
              perf:     this._renderPerf,
              errors:   this._renderErrors,
              console:  this._renderConsole,
              events:   this._renderEvents,
              slowapi:  this._renderSlowApi,
              memory:   this._renderMemory,
              history:  this._renderHistory,
              env:      this._renderEnv,
          };
          const fn = map[this._tab];
          return b`<div class="tab-content">${fn ? fn.call(this) : ''}</div>`;
      }

      // ── Summary ────────────────────────────────────────────────────────────
      _renderSummary() {
          const r = this._getActiveReport();
          if (!r) return b`<p class="empty">No data</p>`;
          const findings = _computeFindings(r);
          const score    = _pageHealthScore(r);
          const { grade, color } = _gradeFromScore(score);
          const env = r.environment;
          const v   = r.vitals;
          return b`
            <div class="health-block">
                <span class="health-grade" style="color:${color}">${grade}</span>
                <div><div class="health-score" style="color:${color}">${score}/100</div><div class="health-meta">Page Health</div></div>
                ${v?.lcp ? b`<div><div style="font-size:13px;font-weight:bold;color:${v.lcp.valueMs<2500?'#a6e3a1':v.lcp.valueMs<4000?'#f9e2af':'#f38ba8'}">${v.lcp.valueMs}ms</div><div class="health-meta">LCP</div></div>` : ''}
                ${v?.cls ? b`<div><div style="font-size:13px;font-weight:bold;color:${v.cls.value<0.1?'#a6e3a1':v.cls.value<0.25?'#f9e2af':'#f38ba8'}">${v.cls.value.toFixed(3)}</div><div class="health-meta">CLS</div></div>` : ''}
                ${v?.inp ? b`<div><div style="font-size:13px;font-weight:bold;color:${v.inp.valueMs<200?'#a6e3a1':v.inp.valueMs<500?'#f9e2af':'#f38ba8'}">${v.inp.valueMs}ms</div><div class="health-meta">INP</div></div>` : ''}
            </div>

            <div class="stats-row">
                <div class="stat-chip"><div class="num">${(r.errors||[]).length}</div><div class="lbl">Crashes</div></div>
                <div class="stat-chip"><div class="num">${(r.storms||[]).length}</div><div class="lbl">Storms</div></div>
                <div class="stat-chip"><div class="num">${(r.slowApi||[]).length}</div><div class="lbl">Slow APIs</div></div>
                <div class="stat-chip"><div class="num">${(r.network||[]).filter(n=>n.isError).length}</div><div class="lbl">Net Errors</div></div>
                <div class="stat-chip"><div class="num">${Object.keys(r.perf||{}).length}</div><div class="lbl">Components</div></div>
                ${(r.thrash||[]).length > 0 ? b`<div class="stat-chip"><div class="num" style="color:#fab387">${(r.thrash||[]).length}</div><div class="lbl">Prop Thrash</div></div>` : ''}
                ${(r.cycles||[]).length > 0 ? b`<div class="stat-chip"><div class="num" style="color:#f38ba8">${(r.cycles||[]).length}</div><div class="lbl">Cycles</div></div>` : ''}
                ${r.domStats ? b`<div class="stat-chip"><div class="num" style="color:${r.domStats.totalNodes>1500?'#f9e2af':'#89b4fa'}">${r.domStats.totalNodes.toLocaleString()}</div><div class="lbl">DOM Nodes</div></div>` : ''}
            </div>

            <div class="section-title">Findings</div>
            ${findings.map(f => b`<div class="finding ${f.severity}"><span>${f.icon}</span><span>${f.text}</span></div>`)}

            ${env ? b`
                <div class="section-title">Environment</div>
                ${this._kvRow('Browser', env.browser?.version || '—')}
                ${env.hardware?.deviceMemoryGB !== 'unknown' ? this._kvRow('Device RAM', `${env.hardware.deviceMemoryGB} GB`) : ''}
                ${this._kvRow('CPU cores', String(env.hardware?.cpuCores || '?'))}
                ${env.heap ? this._kvRow('JS Heap', `${env.heap.usedMB}MB used / ${env.heap.limitMB}MB limit`) : ''}
                ${env.pageLoad ? this._kvRow('Page load', `${env.pageLoad.loadMs}ms (TTFB ${env.pageLoad.ttfbMs}ms)`) : ''}` : ''}
        `;
      }

      // ── Pinpoint ───────────────────────────────────────────────────────────
      _renderPinpoint() {
          const r = this._getActiveReport();
          if (!r) return b`<p class="empty">No data</p>`;
          const issues = _buildPinpointIssues(r);
          if (!issues.length) return b`<p class="empty">✅ No pinpointable issues.<br>Ensure perf, memory, errorBoundary, network tools are enabled.</p>`;
          return b`
            <div class="filter-bar" style="justify-content:space-between">
                <button class="stack-filter-toggle" @click=${()=>{ this._stackFilterOn=!this._stackFilterOn; }}>
                    ${this._stackFilterOn ? '📦 App frames only (click for all)' : '🌐 All frames (click for app only)'}
                </button>
                <button class="header-btn accent" @click=${this._exportFixTable}>📋 Export Fix Table (${issues.length})</button>
            </div>
            ${issues.map(i => this._renderIssueCard(i))}`;
      }

      _renderIssueCard(issue) {
          const expanded  = this._expandedIssue === issue.id;
          const stacksExp = this._expandedStacks[issue.id];
          const r         = this._getActiveReport();
          const lineNum   = _extractLineNumber(
              (issue.callStacks || [])[0] ? _filterAppStack((issue.callStacks || [])[0]) : null
          );
          const related = _findRelatedComponents(issue.component, r?.eventsTimeline || []);
          return b`
            <div class="issue-card">
                <div class="issue-header" @click=${()=>{ this._expandedIssue = expanded ? null : issue.id; }}>
                    <span class="issue-sev ${issue.severity}">${issue.severity.toUpperCase()}</span>
                    <div class="issue-info">
                        <span class="issue-component">&lt;${issue.component}&gt;</span>
                        <span class="issue-type">${issue.issueType}</span>
                        ${issue.filePath ? b`<div class="issue-filepath" title="${issue.filePath}">
                            ${issue.filePath}${lineNum ? b`<span style="color:#6c7086"> :${lineNum}</span>` : ''}
                        </div>` : ''}
                    </div>
                    <span style="color:#6c7086;font-size:14px">${expanded?'▲':'▼'}</span>
                </div>
                ${expanded ? b`
                    <div class="issue-body">
                        <div class="issue-details">${issue.details}</div>
                        <div class="issue-rec">💡 ${issue.recommendation}</div>
                        ${related.length ? b`
                            <div style="margin-top:8px;font-size:10px;color:#6c7086">Event-related components:</div>
                            <div style="margin-top:2px">${related.map(t => b`<span class="tag-pill">${t}</span>`)}</div>
                        ` : ''}
                        ${issue.callStacks?.length > 0 ? b`
                            <button class="stack-toggle" @click=${()=>{ this._expandedStacks={...this._expandedStacks,[issue.id]:!stacksExp}; }}>
                                ${stacksExp?'▲ Hide':'▼ Show'} call stack (${issue.callStacks.length})
                            </button>
                            ${stacksExp ? issue.callStacks.map((s,idx) => b`
                                <div style="color:#6c7086;font-size:10px;margin:2px 0">Stack #${idx+1}</div>
                                <pre class="stack-pre">${this._applyStack(s)}</pre>`) : ''}
                        ` : b`<div style="color:#45475a;font-size:10px;margin-top:6px">No call stack available</div>`}
                    </div>` : ''}
            </div>`;
      }

      // ── Vitals ─────────────────────────────────────────────────────────────
      _renderVitals() {
          const r = this._getActiveReport();
          const v = r?.vitals;
          if (!v) return b`<p class="empty">No vitals data — enable vitals tool (window.__LDS_VITALS_ENABLED__ = true)</p>`;

          const lcpClass = !v.lcp ? '' : v.lcp.valueMs < 2500 ? 'vital-good' : v.lcp.valueMs < 4000 ? 'vital-needs' : 'vital-poor';
          const clsClass = !v.cls ? '' : v.cls.value < 0.1 ? 'vital-good' : v.cls.value < 0.25 ? 'vital-needs' : 'vital-poor';
          const inpClass = !v.inp ? '' : v.inp.valueMs < 200 ? 'vital-good' : v.inp.valueMs < 500 ? 'vital-needs' : 'vital-poor';

          return b`
            <div class="vital-card">
                <div class="vital-val ${lcpClass}">${v.lcp ? `${v.lcp.valueMs}ms` : '—'}</div>
                <div class="vital-info"><div class="vital-name">LCP — Largest Contentful Paint</div><div class="vital-desc">Good &lt;2500ms · Needs improvement &lt;4000ms · Poor ≥4000ms${v.lcp?.element ? ` · Element: &lt;${v.lcp.element}&gt;` : ''}</div></div>
            </div>
            <div class="vital-card">
                <div class="vital-val ${clsClass}">${v.cls ? v.cls.value.toFixed(3) : '—'}</div>
                <div class="vital-info"><div class="vital-name">CLS — Cumulative Layout Shift</div><div class="vital-desc">Good &lt;0.1 · Needs improvement &lt;0.25 · Poor ≥0.25 · ${v.cls?.entries?.length || 0} shift event(s)</div></div>
            </div>
            <div class="vital-card">
                <div class="vital-val ${inpClass}">${v.inp ? `${v.inp.valueMs}ms` : '—'}</div>
                <div class="vital-info"><div class="vital-name">INP — Interaction to Next Paint</div><div class="vital-desc">Good &lt;200ms · Needs improvement &lt;500ms · Poor ≥500ms${v.inp?.eventType ? ` · Event: ${v.inp.eventType}` : ''}</div></div>
            </div>

            <div class="section-title">Long Tasks (${(v.longTasks||[]).length})</div>
            ${!(v.longTasks||[]).length ? b`<p class="empty">No long tasks recorded</p>` : b`
                <table>
                    <thead><tr><th>Duration ms</th><th>Time</th></tr></thead>
                    <tbody>${(v.longTasks||[]).slice().reverse().slice(0,50).map(t => b`
                        <tr><td class="${t.durationMs>150?'slow':''}">${t.durationMs}</td><td>${(t.ts||'').slice(11,19)}</td></tr>`)}</tbody>
                </table>`}
        `;
      }

      // ── Network ────────────────────────────────────────────────────────────
      _renderNetwork() {
          const r   = this._getActiveReport();
          const all = r?.network || [];
          if (!all.length) return b`<p class="empty">No network data — enable network tool (window.__LDS_NETWORK_ENABLED__ = true)</p>`;

          const f        = this._networkFilter;
          const searchLc = f.search.toLowerCase();
          const filtered = all.slice().reverse().filter(n => {
              if (f.status === 'error'   && !n.isError)  return false;
              if (f.status === 'slow'    && !n.isSlow)   return false;
              if (f.status === 'large'   && !n.isLarge)  return false;
              if (f.status === 'decoded' && !n.decoded)  return false;
              if (searchLc) {
                  const urlMatch  = n.url?.toLowerCase().includes(searchLc);
                  const decMatch  = n.decoded ? JSON.stringify(n.decoded).toLowerCase().includes(searchLc) : false;
                  if (!urlMatch && !decMatch) return false;
              }
              return true;
          }).slice(0, 100);

          const errCount     = all.filter(n => n.isError).length;
          const slowCount    = all.filter(n => n.isSlow).length;
          const largeCount   = all.filter(n => n.isLarge).length;
          const decodedCount = all.filter(n => n.decoded).length;

          return b`
            <div class="filter-bar">
                <select class="filter-select" .value=${f.status} @change=${e=>{ this._networkFilter={...f,status:e.target.value}; this._expandedNetIdx=null; }}>
                    <option value="all">All (${all.length})</option>
                    <option value="error">Errors (${errCount})</option>
                    <option value="slow">Slow (${slowCount})</option>
                    <option value="large">Large (${largeCount})</option>
                    ${decodedCount > 0 ? b`<option value="decoded">Decoded (${decodedCount})</option>` : ''}
                </select>
                <input class="filter-input" type="text" placeholder="Filter URL or decoded content…"
                    .value=${f.search} @input=${e=>{ this._networkFilter={...f,search:e.target.value}; this._expandedNetIdx=null; }}>
            </div>
            <table>
                <thead><tr><th>Method</th><th>URL / Decoded</th><th>Status</th><th>ms</th><th>KB</th><th>Type</th><th></th></tr></thead>
                <tbody>${filtered.map((n, idx) => {
                    const dc    = n.decoded;
                    const isExp = this._expandedNetIdx === idx;
                    const rowCls = n.isError ? 'slow' : n.isSlow ? 'warn-cell' : '';
                    return b`
                    <tr style="cursor:pointer" @click=${() => { this._expandedNetIdx = isExp ? null : idx; }}>
                        <td>${n.method}</td>
                        <td class="${rowCls}" style="max-width:220px">
                            ${dc ? b`
                                <div style="color:#cba6f7;font-weight:bold;font-size:11px">${dc.operation || dc.method || '?'}${dc.domain ? b` <span style="color:#6c7086;font-weight:normal">· ${dc.domain}</span>` : ''}</div>
                                <div style="color:#89b4fa;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dc.callPath || ''}</div>
                                ${dc.types?.length ? b`<div>${dc.types.slice(0,4).map(t => b`<span class="tag-pill">${t}</span>`)}</div>` : ''}
                            ` : b`
                                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;font-size:11px" title="${n.fullUrl||n.url}">${n.url}</span>
                            `}
                        </td>
                        <td class="${n.isError?'slow':''}">${n.status || (n.error ? 'ERR' : '—')}</td>
                        <td class="${n.isSlow?'slow':''}">${n.durationMs}</td>
                        <td class="${n.isLarge?'warn-cell':''}">${n.responseSizeKB != null ? n.responseSizeKB : '—'}</td>
                        <td style="color:${dc?'#cba6f7':'#6c7086'}">${dc ? 'decoded' : n.type}</td>
                        <td style="color:#6c7086;font-size:11px;text-align:center">${isExp ? '▲' : '▼'}</td>
                    </tr>
                    ${isExp ? b`<tr><td colspan="7" style="padding:0">${this._renderNetExpand(n)}</td></tr>` : ''}`;
                })}</tbody>
            </table>`;
      }

      _renderNetExpand(n) {
          const dc = n.decoded;
          const kv = (k, v) => v != null ? b`
            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a1a28">
                <span class="net-kv-key">${k}</span><span class="net-kv-val">${v}</span>
            </div>` : '';

          return b`
            <div class="net-expand">
                ${dc ? b`
                    <div class="decoded-section">
                        <div class="decoded-header">🔮 Decoded Request</div>
                        ${kv('Call path',    dc.callPath)}
                        ${kv('Path segments', dc.callPathArr?.join(' → '))}
                        ${kv('Method',       dc.method)}
                        ${kv('Operation',    dc.operation)}
                        ${kv('Domain',       dc.domain)}
                        ${kv('App',          dc.appName)}
                        ${dc.types?.length ? b`
                            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a1a28">
                                <span class="net-kv-key">Entity types</span>
                                <span class="net-kv-val">${dc.types.map(t => b`<span class="tag-pill">${t}</span>`)}</span>
                            </div>` : ''}
                        ${dc.options ? b`
                            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a1a28">
                                <span class="net-kv-key">Pagination</span>
                                <span class="net-kv-val" style="color:#f9e2af">from ${dc.options.from ?? '?'} · to ${dc.options.to ?? '?'} · maxRecords ${dc.options.maxRecords ?? '?'}</span>
                            </div>` : ''}
                        ${dc.sort?.length ? b`
                            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a1a28">
                                <span class="net-kv-key">Sort</span>
                                <span class="net-kv-val">${dc.sort.map(s => `${s.field} ${s.dir}${s.type ? ` (${s.type})` : ''}`).join(', ')}</span>
                            </div>` : ''}
                        ${dc.filters ? b`
                            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a1a28">
                                <span class="net-kv-key">Extra filters</span>
                                <span class="net-kv-val" style="font-size:10px;color:#6c7086">${JSON.stringify(dc.filters).slice(0, 200)}</span>
                            </div>` : ''}
                    </div>
                ` : ''}

                <div style="color:#89b4fa;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px${dc ? ';margin-top:10px' : ''}">Request Details</div>
                ${kv('Full URL', b`<span style="word-break:break-all;font-size:10px">${n.fullUrl || n.url}</span>`)}
                ${kv('Timestamp', n.ts?.slice(0, 19).replace('T', ' '))}
                ${kv('Duration', b`<span class="${n.isSlow ? 'slow' : ''}">${n.durationMs}ms${n.isSlow ? ' ⚠️ slow' : ''}</span>`)}
                ${kv('Response size', n.responseSizeKB != null ? `${n.responseSizeKB} KB${n.isLarge ? ' ⚠️ large' : ''}` : 'unknown')}
                ${n.error ? b`
                    <div style="display:flex;gap:8px;padding:3px 0">
                        <span class="net-kv-key" style="color:#f38ba8">Error</span>
                        <span class="net-kv-val" style="color:#f38ba8">${n.error}</span>
                    </div>` : ''}
            </div>`;
      }

      // ── Performance ────────────────────────────────────────────────────────
      _renderPerf() {
          const r = this._getActiveReport();
          if (!r) return b`<p class="empty">No data</p>`;
          const entries = Object.entries(r.perf||{}).sort((a,b)=>b[1].totalMs/b[1].count - a[1].totalMs/a[1].count);
          if (!entries.length) return b`<p class="empty">No data — enable perf tool and remount components</p>`;
          const reasons = r.renderReasons || {};
          return b`
            <table>
                <thead><tr><th>Component</th><th>Renders</th><th>Avg ms</th><th>Max ms</th><th>Min ms</th><th>Health</th><th></th></tr></thead>
                <tbody>${entries.map(([tag,d]) => {
                    const avg = Math.round(d.totalMs/d.count);
                    const hs  = _componentHealthScore(tag, r);
                    const { grade: hg, color: hc } = _gradeFromScore(hs);
                    const tagReasons = (reasons[tag] || []).slice(-10).reverse();
                    const isExpanded = this._expandedPerfTag === tag;
                    const thrashProps = (r.thrash || []).filter(t => t.tag === tag).map(t => t.prop);
                    return b`
                        <tr style="cursor:${tagReasons.length ? 'pointer' : 'default'}" @click=${() => { this._expandedPerfTag = isExpanded ? null : tag; }}>
                            <td>&lt;${tag}&gt;${thrashProps.length ? b` <span title="Property thrash: ${thrashProps.join(', ')}" style="color:#fab387;font-size:10px">🔄</span>` : ''}</td>
                            <td>${d.count}</td>
                            <td class="${avg>500?'slow':''}">${avg}</td>
                            <td class="${d.maxMs>1000?'slow':''}">${Math.round(d.maxMs)}</td>
                            <td>${d.minMs===Infinity?'-':Math.round(d.minMs)}</td>
                            <td style="color:${hc};font-weight:bold">${hg}</td>
                            <td style="color:#6c7086;font-size:11px">${tagReasons.length ? (isExpanded ? '▲' : '▼') : ''}</td>
                        </tr>
                        ${isExpanded && tagReasons.length ? b`
                        <tr><td colspan="7" style="padding:0">
                            <div style="background:#13131f;border-top:1px solid #313244;padding:8px 12px">
                                <div style="color:#89b4fa;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Last ${tagReasons.length} changes that triggered updates</div>
                                <table style="margin:0">
                                    <thead><tr><th>Property</th><th>Old value</th><th>New value</th><th>Same ref?</th><th>Time</th></tr></thead>
                                    <tbody>${tagReasons.map(rr => b`<tr>
                                        <td style="color:#cba6f7">.${rr.prop}</td>
                                        <td style="color:#f38ba8;font-size:10px">${rr.oldSummary}</td>
                                        <td style="color:#a6e3a1;font-size:10px">${rr.newSummary}</td>
                                        <td style="color:${rr.sameRef ? '#f38ba8' : '#6c7086'};font-size:10px">${rr.sameRef ? '⚠️ yes' : 'no'}</td>
                                        <td>${(rr.ts||'').slice(11,19)}</td>
                                    </tr>`)}</tbody>
                                </table>
                            </div>
                        </td></tr>` : ''}`;
                })}</tbody>
            </table>`;
      }

      // ── Errors ─────────────────────────────────────────────────────────────
      _renderErrors() {
          const r = this._getActiveReport();
          if (!r) return b`<p class="empty">No data</p>`;
          const f = this._errorFilter;
          const errors = (r.errors||[]).filter(e =>
              !f.search || e.message?.toLowerCase().includes(f.search.toLowerCase()) || e.tag?.toLowerCase().includes(f.search.toLowerCase())
          );
          return b`
            <div class="filter-bar">
                <input class="filter-input" type="text" placeholder="Filter by component or message…" .value=${f.search} @input=${e=>{ this._errorFilter={...f,search:e.target.value}; }}>
            </div>
            ${!errors.length ? b`<p class="empty">${(r.errors||[]).length ? 'No matches' : 'No crashes ✅'}</p>` : b`
            <table>
                <thead><tr><th>Component</th><th>Phase</th><th>Message</th><th>Time</th></tr></thead>
                <tbody>${errors.map(e => b`<tr>
                    <td>&lt;${e.tag}&gt;</td><td>${e.phase}</td>
                    <td title="${e.stack||''}">${e.message}</td>
                    <td>${(e.ts||'').slice(11,19)}</td>
                </tr>`)}</tbody>
            </table>`}`;
      }

      // ── Console ────────────────────────────────────────────────────────────
      _renderConsole() {
          const r = this._getActiveReport();
          if (!r) return b`<p class="empty">No data</p>`;
          const f = this._consoleFilter;
          const entries = (r.console||[]).filter(e => {
              if (f.level !== 'all' && e.level !== f.level) return false;
              if (f.search && !e.message?.toLowerCase().includes(f.search.toLowerCase())) return false;
              return true;
          }).slice().reverse();

          const errCount  = (r.console||[]).filter(e=>e.level==='error').length;
          const warnCount = (r.console||[]).filter(e=>e.level==='warn').length;

          return b`
            <div class="filter-bar">
                <select class="filter-select" .value=${f.level} @change=${e=>{ this._consoleFilter={...f,level:e.target.value}; }}>
                    <option value="all">All (${(r.console||[]).length})</option>
                    <option value="error">Error (${errCount})</option>
                    <option value="warn">Warn (${warnCount})</option>
                </select>
                <input class="filter-input" type="text" placeholder="Filter message…" .value=${f.search} @input=${e=>{ this._consoleFilter={...f,search:e.target.value}; }}>
            </div>
            ${!entries.length ? b`<p class="empty">No entries match</p>` :
                entries.map(e => b`<div class="log-entry">
                    <span class="level-badge ${e.level}">${e.level}</span>
                    <span class="log-msg">${e.message}</span>
                    <span class="log-ts">${(e.ts||'').slice(11,19)}</span>
                </div>`)}`;
      }

      // ── Events Timeline / Frequency ────────────────────────────────────────
      _renderEvents() {
          const r = this._getActiveReport();
          if (!r) return b`<p class="empty">No data</p>`;

          const hasTimeline = (r.eventsTimeline||[]).length > 0;
          const hasFreq     = r.eventsFreq && Object.keys(r.eventsFreq).length > 0;

          if (!hasTimeline && !hasFreq) return b`<p class="empty">No events recorded — set window.__LDS_EVENTS_TRACE__ = true, or wire your event bus with LdsEventTracer.patchDispatch()</p>`;

          return b`
            <div class="filter-bar" style="margin-bottom:10px">
                <button class="header-btn${this._eventsView==='timeline'?' accent':''}" @click=${()=>{ this._eventsView='timeline'; }}>📋 Timeline (${(r.eventsTimeline||[]).length})</button>
                <button class="header-btn${this._eventsView==='freq'?' accent':''}" @click=${()=>{ this._eventsView='freq'; }}>📊 Frequency (${hasFreq ? Object.keys(r.eventsFreq).length : 0})</button>
            </div>
            ${this._eventsView === 'freq' ? this._renderEventsFreq(r) : this._renderEventsTimeline(r)}`;
      }

      _renderEventsTimeline(r) {
          const entries = (r.eventsTimeline||[]).slice(-100).reverse();
          if (!entries.length) return b`<p class="empty">No timeline entries</p>`;
          return b`
            <table>
                <thead><tr><th>#</th><th>Event</th><th>From</th><th>+ms</th></tr></thead>
                <tbody>${entries.map(e => b`<tr>
                    <td>${e.seq??''}</td>
                    <td>${e.name??JSON.stringify(e).slice(0,60)}</td>
                    <td style="color:#6c7086;font-size:10px">${e.from ? `<${e.from}>` : '—'}</td>
                    <td>${e.elapsed!=null?e.elapsed:''}</td>
                </tr>`)}</tbody>
            </table>`;
      }

      _renderEventsFreq(r) {
          const freq    = r.eventsFreq || {};
          const entries = Object.entries(freq).sort((a,b)=>b[1].count-a[1].count);
          if (!entries.length) return b`<p class="empty">No frequency data</p>`;
          return b`
            <table>
                <thead><tr><th>Event</th><th>Count</th><th>Sources</th></tr></thead>
                <tbody>${entries.map(([name, d]) => {
                    const hot = d.count > 20;
                    return b`<tr>
                        <td style="color:${hot?'#f38ba8':'#cdd6f4'}">${name}${hot ? b` <span title="High frequency" style="color:#f38ba8;font-size:10px">🔥</span>` : ''}</td>
                        <td class="${hot?'freq-hot':''}">${d.count}</td>
                        <td style="color:#6c7086;font-size:10px">${(d.sources||[]).map(s=>`<${s}>`).join(', ') || '—'}</td>
                    </tr>`;
                })}</tbody>
            </table>`;
      }

      // ── Slow API ──────────────────────────────────────────────────────────
      _renderSlowApi() {
          const r = this._getActiveReport();
          if (!r) return b`<p class="empty">No data</p>`;
          const entries = (r.slowApi||[]).slice().reverse();
          if (!entries.length) return b`<p class="empty">No slow API calls recorded</p>`;
          return b`
            <table>
                <thead><tr><th>Method</th><th>Duration ms</th><th>Component</th><th>Time</th></tr></thead>
                <tbody>${entries.map(e => b`<tr>
                    <td>${e.method??'-'}</td><td class="slow">${e.ms??e.durationMs??'-'}</td>
                    <td>${e.tag??'-'}</td><td>${String(e.ts||'').slice(11,19)}</td>
                </tr>`)}</tbody>
            </table>`;
      }

      // ── Memory ────────────────────────────────────────────────────────────
      _renderMemory() {
          const r = this._getActiveReport();
          if (!r) return b`<p class="empty">No data</p>`;
          const entries = Object.entries(r.memory||{}).sort((a,b)=>b[1].mounted-a[1].mounted);
          if (!entries.length) return b`<p class="empty">No memory data</p>`;
          return b`
            <table>
                <thead><tr><th>Component</th><th>Mounted</th><th>Unmounted</th><th>Alive</th><th>GC freed</th></tr></thead>
                <tbody>${entries.map(([tag,v]) => {
                    const alive = (v.mounted||0)-(v.unmounted||0);
                    const leak  = alive>3 && (v.gcCount||0)<alive*0.5;
                    return b`<tr>
                        <td>&lt;${tag}&gt;</td><td>${v.mounted??0}</td><td>${v.unmounted??0}</td>
                        <td class="${alive>100?'slow':leak?'warn-cell':''}">${alive}${leak?' ⚠️':''}</td>
                        <td>${v.gcCount??0}</td>
                    </tr>`;
                })}</tbody>
            </table>`;
      }

      // ── History ───────────────────────────────────────────────────────────
      _renderHistory() {
          const h            = (window.__LDS_HISTORY__||[]).slice().reverse();
          const activeReport = this._activeReport;
          const sel          = this._diffSelected;
          const canCompare   = sel.size === 2;

          if (this._diffView) return this._renderDiff();

          return b`
            <div class="history-bar">
                <span style="color:#6c7086;font-size:11px">${h.length} snapshot${h.length!==1?'s':''} (max 20)</span>
                <div style="display:flex;gap:6px">
                    ${canCompare ? b`<button class="header-btn accent" @click=${this._runDiff}>🔀 Compare ${sel.size}</button>` : ''}
                    ${sel.size > 0 ? b`<button class="header-btn" @click=${()=>{ this._diffSelected=new Set(); }}>Clear sel.</button>` : ''}
                    ${h.length>0 ? b`<button class="header-btn" style="color:#f38ba8" @click=${this._clearHistory}>Clear All</button>` : ''}
                </div>
            </div>
            ${sel.size === 1 ? b`<p style="color:#6c7086;font-size:11px;margin-bottom:8px">Select one more snapshot to compare</p>` : ''}
            ${!h.length ? b`<p class="empty">No history yet. ↻ Refresh a few times or use ⬇ to build history.</p>` : b`
            <table>
                <thead><tr><th>☑</th><th>Time</th><th>Source</th><th>Session</th><th>Issues</th><th></th></tr></thead>
                <tbody>${h.map(item => {
                    const isViewing  = item.report === activeReport;
                    const isSelected = sel.has(item.id);
                    const issues = _buildPinpointIssues(item.report||{});
                    const crit   = issues.filter(i=>i.severity==='critical').length;
                    const high   = issues.filter(i=>i.severity==='high').length;
                    return b`<tr class="${isViewing?'viewing-row':''}${isSelected?' viewing-row':''}">
                        <td>
                            <input type="checkbox" .checked=${isSelected}
                                @change=${e => {
                                    const next = new Set(sel);
                                    if (e.target.checked) { if (next.size < 2) next.add(item.id); else e.target.checked = false; }
                                    else next.delete(item.id);
                                    this._diffSelected = next;
                                }}>
                        </td>
                        <td>${(item.capturedAt||'').slice(0,10)}<br><span style="color:#6c7086">${(item.capturedAt||'').slice(11,19)}</span></td>
                        <td><span class="source-pill ${item.source}">${item.source}</span></td>
                        <td style="font-size:10px;color:#6c7086">…${(item.sessionId||'').slice(-10)}</td>
                        <td style="font-size:10px">
                            ${crit>0?b`<span style="color:#f38ba8">🔴${crit}</span> `:''}
                            ${high>0?b`<span style="color:#fab387">🟠${high}</span>`:''}
                            ${crit===0&&high===0?b`<span style="color:#a6e3a1">✅</span>`:''}
                        </td>
                        <td>${isViewing
                            ? b`<span style="color:#a6e3a1;font-size:10px">viewing</span>`
                            : b`<button class="header-btn" @click=${()=>this._viewHistoryItem(item)}>View</button>`}
                        </td>
                    </tr>`;
                })}</tbody>
            </table>`}`;
      }

      _runDiff() {
          const h   = (window.__LDS_HISTORY__||[]);
          const sel = this._diffSelected;
          const two = h.filter(item => sel.has(item.id));
          if (two.length < 2) return;
          two.sort((x, y) => (x.capturedAt||'').localeCompare(y.capturedAt||''));
          const [a, b] = two;
          this._diffView = { a, b, result: _buildDiff(a.report, b.report) };
      }

      _renderDiff() {
          const { a, b: b$1, result } = this._diffView;
          return b`
            <div class="history-bar">
                <div>
                    <span style="color:#6c7086;font-size:11px">Comparing:</span>
                    <span style="color:#a6e3a1;font-size:11px;margin:0 6px">${(a.capturedAt||'').slice(11,19)} (older)</span>
                    <span style="color:#6c7086">→</span>
                    <span style="color:#89b4fa;font-size:11px;margin-left:6px">${(b$1.capturedAt||'').slice(11,19)} (newer)</span>
                </div>
                <button class="header-btn" @click=${()=>{ this._diffView=null; }}>← Back</button>
            </div>

            <div class="section-title">Metrics</div>
            <table>
                <thead><tr><th>Metric</th><th style="color:#a6e3a1">Older</th><th style="color:#89b4fa">Newer</th><th>Change</th></tr></thead>
                <tbody>${result.metrics.map(m => b`<tr>
                    <td>${m.label}</td>
                    <td style="color:#a6e3a1">${m.aVal}</td>
                    <td style="color:#89b4fa">${m.bVal}</td>
                    <td class="${m.dir==='better'?'diff-better':m.dir==='worse'?'diff-worse':'diff-same'}">${m.dir==='better'?'▼ better':m.dir==='worse'?'▲ worse':'—'} ${m.delta || ''}</td>
                </tr>`)}</tbody>
            </table>

            ${result.newIssues.length ? b`
                <div class="section-title" style="color:#f38ba8">New Issues (appeared in newer)</div>
                ${result.newIssues.map(i => b`<div class="finding high"><span class="issue-sev ${i.severity}" style="display:inline-block">${i.severity}</span> <span style="color:#89b4fa">&lt;${i.component}&gt;</span> ${i.issueType}</div>`)}
            ` : ''}

            ${result.fixedIssues.length ? b`
                <div class="section-title" style="color:#a6e3a1">Fixed Issues (gone in newer)</div>
                ${result.fixedIssues.map(i => b`<div class="finding ok"><span>✅</span> <span style="color:#89b4fa">&lt;${i.component}&gt;</span> ${i.issueType} resolved</div>`)}
            ` : ''}

            ${result.newComponents.length ? b`
                <div class="section-title">New Components</div>
                <div>${result.newComponents.map(t => b`<span class="tag-pill" style="color:#a6e3a1">${t}</span>`)}</div>
            ` : ''}

            ${result.removedComponents.length ? b`
                <div class="section-title">Removed Components</div>
                <div>${result.removedComponents.map(t => b`<span class="tag-pill" style="color:#6c7086">${t}</span>`)}</div>
            ` : ''}
        `;
      }

      // ── Environment ───────────────────────────────────────────────────────
      _renderEnv() {
          const r = this._getActiveReport();
          if (!r) return b`<p class="empty">No data</p>`;
          const env = r.environment;
          if (!env) return b`<p class="empty">No environment data</p>`;
          const { browser: b$1, hardware: h, network: n, heap, pageLoad: pl } = env;
          return b`
            <div class="section-title">Browser</div>
            ${this._kvRow('Browser / Version', b$1?.version || '—')}
            ${this._kvRow('User Agent', b$1?.userAgent || '—')}
            ${this._kvRow('Language', b$1?.language || '—')}
            ${this._kvRow('Online', String(b$1?.onLine))}

            <div class="section-title">Hardware</div>
            ${this._kvRow('CPU Cores', String(h?.cpuCores))}
            ${this._kvRow('Device Memory', h?.deviceMemoryGB!=='unknown'?`${h.deviceMemoryGB} GB`:'unavailable')}
            ${this._kvRow('Screen', h?.screen || '—')}

            ${n ? b`<div class="section-title">Network</div>
                ${this._kvRow('Effective Type', n.effectiveType)}
                ${this._kvRow('Downlink', `${n.downlinkMbps} Mbps`)}
                ${this._kvRow('RTT', `${n.rttMs} ms`)}` :
                b`<div class="section-title">Network</div>${this._kvRow('Status','unavailable (non-Chrome)')}`}

            ${heap ? b`<div class="section-title">JS Heap</div>
                ${this._kvRow('Used', `${heap.usedMB} MB`)}
                ${this._kvRow('Total Allocated', `${heap.totalMB} MB`)}
                ${this._kvRow('Limit', `${heap.limitMB} MB`)}` : ''}

            ${pl ? b`<div class="section-title">Page Load Timing</div>
                ${this._kvRow('DNS', `${pl.dnsMs} ms`)}
                ${this._kvRow('TTFB', `${pl.ttfbMs} ms`)}
                ${this._kvRow('DOM Interactive', `${pl.domInteractiveMs} ms`)}
                ${this._kvRow('Full Load', `${pl.loadMs} ms`)}` : ''}

            <div class="section-title">Session</div>
            ${this._kvRow('Session ID', env.sessionId)}
            ${this._kvRow('Captured At', env.capturedAt)}
            ${this._kvRow('URL', env.url)}`;
      }

      _kvRow(key, value) {
          return b`<div class="kv-row"><span class="kv-key">${key}</span><span class="kv-value">${value}</span></div>`;
      }
  }

  customElements.define('lds-debug-panel', LdsDebugPanel);

  exports.LdsDebugPanel = LdsDebugPanel;

  return exports;

})({});
//# sourceMappingURL=panel.bundle.js.map
