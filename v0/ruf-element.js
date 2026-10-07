import { OSElements } from './os-elements.js';
import { ComponentManager } from '../managers/component-manager.js';
import { LocalizationManager } from '../managers/localization-manager.js';
import { PubSubManager } from '../managers/pubsub-manager.js';
import { MixinManager } from '../managers/mixin-manager.js';
import { ObjectUtils } from 'ui-platform-utils/lib/common/ObjectUtils';
import { UniqueIdUtils } from 'ui-platform-utils/lib/common/UniqueIdUtils';
import { AppInstanceManager } from '../managers/app-instance-manager';
import { aci } from 'ui-platform-aci/index.js';
import { RufErrorBoundary } from './ruf-error-boundary.js';
import { RufPerfMonitor } from './ruf-perf.js';
import { RufPropAudit } from './ruf-prop-audit.js';
import { RufInspector } from './ruf-inspector.js';
import { RufMemoryMonitor } from './ruf-memory.js';
import { RufAciTracer } from './ruf-aci-tracer.js';
import { RufSlowApiMonitor } from './ruf-slow-api.js';
import { RufConsole } from './ruf-console.js';
import { RufVitals } from './ruf-vitals.js';
import { RufNetwork } from './ruf-network.js';
import { RufCycleDetector } from './ruf-cycle-detector.js';


/**
 * Returns the active debug flag.
 * Priority: window.__RUF_DEBUG__ → mainApp.globalSettings.rufDebugEnabled → false
 * Shape: true/'*' enables all tools; { toolKey: true } enables specific tools.
 */
function _getDebugFlag() {
    if (typeof window !== 'undefined' && window.__RUF_DEBUG__ !== undefined) {
        return window.__RUF_DEBUG__;
    }
    const tenantFlag = OSElements.mainApp?.globalSettings?.rufDebugEnabled;
    if (tenantFlag != null) return tenantFlag;
    return false;
}

/**
 * Returns true if the named debug tool should attach on this element mount.
 *
 * Each tool's own per-tool flag is honoured as a standalone activator so that
 * existing workflows (e.g. setting __RUF_PERF_ENABLED__ directly) keep working
 * without requiring the master __RUF_DEBUG__ switch.
 *
 * Tool keys   Per-tool flag
 * ─────────────────────────────────────────────────────
 * perf         window.__RUF_PERF_ENABLED__
 * propAudit    window.__RUF_PROP_DEBUG__      (string tag or '*')
 * inspector    window.__RUF_INSPECTOR__
 * aciTracer    window.__RUF_ACI_TRACE__
 * slowApi      window.__RUF_SLOW_API__
 * console      window.__RUF_CONSOLE_ENABLED__
 * vitals         window.__RUF_VITALS_ENABLED__
 * network         window.__RUF_NETWORK_ENABLED__
 * cycleDetector   window.__RUF_CYCLE_DETECT__
 * errorBoundary   (no per-tool flag)
 * memory          (no per-tool flag)
 */
function _toolEnabled(toolKey) {
    if (toolKey === 'perf'         && window.__RUF_PERF_ENABLED__)     return true;
    if (toolKey === 'propAudit'    && window.__RUF_PROP_DEBUG__)        return true;
    if (toolKey === 'inspector'    && window.__RUF_INSPECTOR__)         return true;
    if (toolKey === 'aciTracer'    && window.__RUF_ACI_TRACE__)         return true;
    if (toolKey === 'slowApi'      && window.__RUF_SLOW_API__)          return true;
    if (toolKey === 'console'      && window.__RUF_CONSOLE_ENABLED__)   return true;
    if (toolKey === 'vitals'         && window.__RUF_VITALS_ENABLED__)    return true;
    if (toolKey === 'network'        && window.__RUF_NETWORK_ENABLED__)   return true;
    if (toolKey === 'cycleDetector'  && window.__RUF_CYCLE_DETECT__)      return true;
    const flag = _getDebugFlag();
    if (!flag)                                     return false;
    if (flag === true)                             return true;
    if (typeof flag === 'object' && flag !== null) return !!flag[toolKey];
    return false;
}

/**
 * RufElement provides common properties and methods that must be  implemented for all
 * elements and components. It is a mandatory behavior for all elements and components to implement.
 * RufElement has multiple properties that are used in the context flow, authentication, and configuration.
 * @class RufElement
 * @usage `import { RufElement } from 'ui-platform-elements/src/base/ruf-element.js'`
 * @extends PolymerElement Base class for all elements
 */
let RufElement = superclass =>
    class extends MixinManager(superclass).with(aci.uiInit) {
        /**
         * @constructor
         */
        constructor(rufArgs) {
            super();
            if (this && (!this.id || this.id == '')) {
                let uniqueId = UniqueIdUtils.getRandomId();
                this.id = rufArgs && rufArgs.viewName ? rufArgs.viewName + '_' + uniqueId : uniqueId;
            }
            if (this && (!this.appId || this.appId == '')) {
                this.appId = this.getAppId();
            }

            //Need to update the property values for Lit app elements
            let mainApp = OSElements.mainApp;
            if (mainApp) {
                this.roles = mainApp.roles;
                this.userId = mainApp.userId;
                this.userFullName = mainApp.fullName;
                this.ownershipData = mainApp.ownershipData;
                this.defaultRole = mainApp.defaultRole;
                this.tenantId = mainApp.tenantId;
            }

            this.isRufComponent = true;
        }

        /**
         * Returns properties of this element
         * @readonly
         * @private
         * @memberof RufElement
         */
        static get properties() {
            return {
                /**
                 * Indicates html identification of the element. If it is not given, then unique identification gets created
                 * @memberof RufElement
                 * @type {String}
                 * @instance
                 */
                id: {
                    type: String
                    // value: ""
                },
                /**
                 * Indicates the tenant identification. It reads the tenant identification from the main App.
                 * @memberof RufElement
                 * @type {String}
                 * @instance
                 */
                tenantId: {
                    type: String,
                    notify: true,
                    value: function () {
                        let mainApp = OSElements.mainApp;
                        if (mainApp) {
                            return mainApp.tenantId;
                        }
                        return '';
                    }
                },
                /**
                 * Indicates the role identification of the currently logged-in user. It reads the role identification from the main App.
                 * @memberof RufElement
                 * @type {String}
                 * @instance
                 */
                roles: {
                    type: String,
                    notify: true,
                    value: function () {
                        let mainApp = OSElements.mainApp;
                        if (mainApp) {
                            return mainApp.roles;
                        }
                        return '';
                    }
                },
                /**
                 * Indicates the default role  of the currently logged-in user. It reads the role identification from the main App.
                 * @memberof RufElement
                 * @type {String}
                 * @instance
                 */
                defaultRole: {
                    type: String,
                    notify: true,
                    value: function () {
                        let mainApp = OSElements.mainApp;
                        if (mainApp) {
                            return mainApp.defaultRole;
                        }
                        return '';
                    }
                },
                /**
                 * Indicates the user identification of the currently logged-in user. It reads the user identification
                 * from the main App.
                 * @memberof RufElement
                 * @type {String}
                 * @instance
                 */
                userId: {
                    type: String,
                    notify: true,
                    value: function () {
                        let mainApp = OSElements.mainApp;
                        if (mainApp) {
                            return mainApp.userId;
                        }
                        return '';
                    }
                },
                /**
                 * Indicates the user full name of the currently logged-in user. It reads the user full name
                 * from the main App.
                 * @memberof RufElement
                 * @type {String}
                 * @instance
                 */
                userFullName: {
                    type: String,
                    notify: true,
                    value: function () {
                        let mainApp = OSElements.mainApp;
                        if (mainApp) {
                            return mainApp.fullName;
                        }
                        return '';
                    }
                },
                /**
                 * Indicates the ownership data of the currently logged-in user. It reads the ownership data identification
                 * from the main App.
                 * @memberof RufElement
                 * @type {String}
                 * @instance
                 */
                ownershipData: {
                    type: String,
                    notify: true,
                    value: function () {
                        let mainApp = OSElements.mainApp;
                        if (mainApp) {
                            return mainApp.ownershipData;
                        }
                        return '';
                    }
                },
                /**
                 * Indicates an App identification. There is no need to pass this value when you use it.
                 * @memberof RufElement
                 * @type {String}
                 * @instance
                 */
                appId: {
                    type: String,
                    value: function () {
                        return this.getAppId();
                    }
                },
                /**
                 * Indicates state
                 * @memberof RufElement
                 * @type {Object}
                 * @instance
                 */
                state: {
                    type: Object,
                    value: function () {
                        return {};
                    }
                },
                /**
                 * Indicates if current component is isRufcomponent
                 * @memberof RufElement
                 * @type {Boolean}
                 * @instance
                 */
                isRufComponent: {
                    type: Boolean,
                    value: true,
                    reflectToAttribute: true
                },
                /**
                 * Indicates if the current compoenet has errorred out.
                 * @memberof RufElement
                 * @type {Boolean}
                 * @instance
                 */
                isComponentErrored: {
                    type: Boolean,
                    value: false
                }
            };
        }

        /**
         * @private
         * @memberof RufElement
         */
        connectedCallback() {
            super.connectedCallback();

            let mainApp = OSElements.mainApp;
            let currentApp = AppInstanceManager.getCurrentActiveApp();

            this.connectUI(mainApp, currentApp);

            // All 7 tool attach calls are zero-cost when no debug flag is active.
            // Set window.__RUF_DEBUG__ = true (or a per-tool object) to enable.
            //
            // For tools whose hot-path work is gated behind their own per-tool flag,
            // we forward-set that flag (defaulting to a sensible value) so that
            // attaching via the master __RUF_DEBUG__ switch makes the tool immediately
            // active. We never overwrite a value the developer already set explicitly.
            if (_toolEnabled('inspector')) {
                if (!window.__RUF_INSPECTOR__)    window.__RUF_INSPECTOR__ = true;
                RufInspector.attach(this);
            }
            if (_toolEnabled('memory'))        RufMemoryMonitor.attach(this);
            if (_toolEnabled('aciTracer')) {
                if (!window.__RUF_ACI_TRACE__)    window.__RUF_ACI_TRACE__ = true;
                RufAciTracer.attach(this);
            }
            if (_toolEnabled('slowApi')) {
                if (!window.__RUF_SLOW_API__)     window.__RUF_SLOW_API__ = true;
                RufSlowApiMonitor.attach(this);
            }
            if (_toolEnabled('errorBoundary')) RufErrorBoundary.attach(this);
            if (_toolEnabled('perf')) {
                if (!window.__RUF_PERF_ENABLED__)    window.__RUF_PERF_ENABLED__ = true;
                RufPerfMonitor.attach(this);
            }
            if (_toolEnabled('propAudit')) {
                if (!window.__RUF_PROP_DEBUG__)      window.__RUF_PROP_DEBUG__ = '*';
                RufPropAudit.attach(this);
            }
            if (_toolEnabled('console')) {
                if (!window.__RUF_CONSOLE_ENABLED__) window.__RUF_CONSOLE_ENABLED__ = true;
                RufConsole.attach(this);
            }
            if (_toolEnabled('cycleDetector')) {
                if (!window.__RUF_CYCLE_DETECT__) window.__RUF_CYCLE_DETECT__ = true;
                RufCycleDetector.attach(this);
            }
            // Page-level tools — init once on first element mount
            if (_toolEnabled('vitals') && !window.__RUF_VITALS_INIT__) {
                window.__RUF_VITALS_INIT__ = true;
                RufVitals.init();
            }
            if (_toolEnabled('network') && !window.__RUF_NETWORK_INIT__) {
                window.__RUF_NETWORK_INIT__ = true;
                RufNetwork.init();
            }
        }

        /**
         * @private
         * @memberof RufElement
         */
        disconnectedCallback() {
            super.disconnectedCallback();
            RufInspector.detach(this);
            RufMemoryMonitor.detach(this);
            RufSlowApiMonitor.detach(this);
            RufAciTracer.detach(this);
            RufErrorBoundary.detach(this);
            RufPropAudit.detach(this);
            RufPerfMonitor.detach(this);
            RufConsole.detach(this);
            RufCycleDetector.detach(this);
        }

        /**
         * Can be used to fire the bedrock event.
         *
         * @method fireBedrockEvent
         * @param {(String)} name The name of the event
         * @param {(Object)} data The detail object for the event
         * @memberof RufElement
         */
        fireBedrockEvent(name, data, settings) {
            return PubSubManager.fireBedrockEvent(name, data, settings, this);
        }

        /**
         * Get app id where this element is hosted
         * @memberof RufElement
         */
        getAppId() {
            let appId = '';
            let componentContainer = ComponentManager.getParentElement(this);

            if (componentContainer && componentContainer.localName == 'main-app') {
                if (componentContainer.id) {
                    appId = componentContainer.id;
                }
            } else {
                let viewComponent = AppInstanceManager.getCurrentActiveApp();
                if (viewComponent) {
                    appId = viewComponent.id;
                }
            }

            return appId;
        }

        /**
         * Get value if not Null or Empty else returns the fallback value
         * @param {Object} val
         * @param {Object} fallbackVal
         * @returns {Object} value
         * @memberof RufElement
         */
        isNullOrEmpty(val, fallbackVal) {
            return ObjectUtils.isNullOrEmpty(val, fallbackVal);
        }

        /**
         * Get properties
         * @memberof RufElement
         * @param {String} attr
         * @returns {Object} Attribute
         */
        getProp(attr) {
            return this.getAttribute(attr);
        }

        /**
         * Use this to get the state query param from the state object
         * @memberof RufElement
         * @returns {String} Query Param
         */
        getQueryParamFromState() {
            return encodeURIComponent(JSON.stringify(this.getState()));
        }

        /**
         * Used to set the state
         * state : {
         *      domain: "thing",
         *      type: "business-rule"
         * }
         * @param {Object} state
         * @memberof RufElement
         * */
        setState(state) {
            this.state = state;
        }

        /**
         * Returns entire State Object
         * @return {Object} State
         * @memberof RufElement
         */
        getState() {
            return this.state;
        }

        /**
         * Returns localized string for given args
         *
         * @param {*} args
         * @returns {String} localized string
         * @memberof RufElement
         */
        localize(...args) {
            return LocalizationManager.localize(...args);
        }

        /**
         * Returns whether the component has errored out or not.
         *
         * @returns {Boolean} is component errorred
         * @memberof RufElement
         */
        hasComponentErrored() {
            return this.isComponentErrored ? true : false;
        }
    };

export { RufElement };
