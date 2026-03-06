var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __forAwait = (obj, it, method) => (it = obj[__knownSymbol("asyncIterator")]) ? it.call(obj) : (obj = obj[__knownSymbol("iterator")](), it = {}, method = (key, fn) => (fn = obj[key]) && (it[key] = (arg) => new Promise((yes, no, done) => (arg = fn.call(obj, arg), done = arg.done, Promise.resolve(arg.value).then((value) => yes({ value, done }), no)))), method("next"), method("return"), it);
var _c, _d, _e, _f;
import "piccolore";
import { escape } from "html-escaper";
import { clsx } from "clsx";
import { useState, useEffect, useCallback, useRef, useMemo } from "preact/hooks";
import { jsxs, jsx, Fragment as Fragment$1 } from "preact/jsx-runtime";
import QRCode from "qrcode";
import { LayoutDashboard, Monitor, Wrench, Palette, Play, LayoutGrid, Library, Globe, UserCircle, PanelLeft } from "lucide-preact";
import { h, Component } from "preact";
import { renderToStringAsync } from "preact-render-to-string";
import "es-module-lexer";
import { encodeBase64, encodeHexUpperCase, decodeBase64 } from "@oslojs/encoding";
import { z } from "zod";
import "cssesc";
const contexts = /* @__PURE__ */ new WeakMap();
function getContext(result) {
  if (contexts.has(result)) {
    return contexts.get(result);
  }
  let ctx = {
    c: 0,
    get id() {
      return "p" + this.c.toString();
    },
    signals: /* @__PURE__ */ new Map(),
    propsToSignals: /* @__PURE__ */ new Map()
  };
  contexts.set(result, ctx);
  return ctx;
}
function incrementId(ctx) {
  let id = ctx.id;
  ctx.c++;
  return id;
}
function isSignal(x) {
  return x != null && typeof x === "object" && typeof x.peek === "function" && "value" in x;
}
function restoreSignalsOnProps(ctx, props) {
  let propMap;
  if (ctx.propsToSignals.has(props)) {
    propMap = ctx.propsToSignals.get(props);
  } else {
    propMap = /* @__PURE__ */ new Map();
    ctx.propsToSignals.set(props, propMap);
  }
  for (const [key, signal] of propMap) {
    props[key] = signal;
  }
  return propMap;
}
function serializeSignals(ctx, props, attrs, map) {
  const signals = {};
  for (const [key, value] of Object.entries(props)) {
    const isPropArray = Array.isArray(value);
    const isPropObject = !isSignal(value) && typeof props[key] === "object" && props[key] !== null && !isPropArray;
    if (isPropObject || isPropArray) {
      const values = isPropObject ? Object.keys(props[key]) : value;
      values.forEach((valueKey, valueIndex) => {
        const signal = isPropObject ? props[key][valueKey] : valueKey;
        if (isSignal(signal)) {
          const keyOrIndex = isPropObject ? valueKey.toString() : valueIndex;
          props[key] = isPropObject ? Object.assign({}, props[key], { [keyOrIndex]: signal.peek() }) : props[key].map(
            (v, i) => i === valueIndex ? [signal.peek(), i] : v
          );
          const currentMap = map.get(key) || [];
          map.set(key, [...currentMap, [signal, keyOrIndex]]);
          const currentSignals = signals[key] || [];
          signals[key] = [...currentSignals, [getSignalId(ctx, signal), keyOrIndex]];
        }
      });
    } else if (isSignal(value)) {
      props[key] = value.peek();
      map.set(key, value);
      signals[key] = getSignalId(ctx, value);
    }
  }
  if (Object.keys(signals).length) {
    attrs["data-preact-signals"] = JSON.stringify(signals);
  }
}
function getSignalId(ctx, item) {
  let id = ctx.signals.get(item);
  if (!id) {
    id = incrementId(ctx);
    ctx.signals.set(item, id);
  }
  return id;
}
const StaticHtml = ({ value, name, hydrate = true }) => {
  if (!value) return null;
  const tagName = hydrate ? "astro-slot" : "astro-static-slot";
  return h(tagName, { name, dangerouslySetInnerHTML: { __html: value } });
};
StaticHtml.shouldComponentUpdate = () => false;
var static_html_default = StaticHtml;
const slotName = (str) => str.trim().replace(/[-_]([a-z])/g, (_, w) => w.toUpperCase());
let originalConsoleError;
let consoleFilterRefs = 0;
async function check(Component$1, props, children) {
  if (typeof Component$1 !== "function") return false;
  if (Component$1.name === "QwikComponent") return false;
  if (Component$1.prototype != null && typeof Component$1.prototype.render === "function") {
    return Component.isPrototypeOf(Component$1);
  }
  useConsoleFilter();
  try {
    const { html } = await renderToStaticMarkup.call(this, Component$1, props, children, void 0);
    if (typeof html !== "string") {
      return false;
    }
    return html == "" ? false : !html.includes("<undefined>");
  } catch (e) {
    return false;
  } finally {
    finishUsingConsoleFilter();
  }
}
function shouldHydrate(metadata) {
  return (metadata == null ? void 0 : metadata.astroStaticSlot) ? !!metadata.hydrate : true;
}
async function renderToStaticMarkup(Component2, props, _a2, metadata) {
  var _b = _a2, { default: children } = _b, slotted = __objRest(_b, ["default"]);
  const ctx = getContext(this.result);
  const slots = {};
  for (const [key, value] of Object.entries(slotted)) {
    const name = slotName(key);
    slots[name] = h(static_html_default, {
      hydrate: shouldHydrate(metadata),
      value,
      name
    });
  }
  let propsMap = restoreSignalsOnProps(ctx, props);
  const newProps = __spreadValues(__spreadValues({}, props), slots);
  const attrs = {};
  serializeSignals(ctx, props, attrs, propsMap);
  const vNode = h(
    Component2,
    newProps,
    children != null ? h(static_html_default, {
      hydrate: shouldHydrate(metadata),
      value: children
    }) : children
  );
  const html = await renderToStringAsync(vNode);
  return { attrs, html };
}
function useConsoleFilter() {
  consoleFilterRefs++;
  if (!originalConsoleError) {
    originalConsoleError = console.error;
    try {
      console.error = filteredConsoleError;
    } catch (e) {
    }
  }
}
function finishUsingConsoleFilter() {
  consoleFilterRefs--;
}
function filteredConsoleError(msg, ...rest) {
  if (consoleFilterRefs > 0 && typeof msg === "string") {
    const isKnownReactHookError = msg.includes("Warning: Invalid hook call.") && msg.includes("https://reactjs.org/link/invalid-hook-call");
    if (isKnownReactHookError) return;
  }
  originalConsoleError(msg, ...rest);
}
const renderer = {
  name: "@astrojs/preact",
  check,
  renderToStaticMarkup,
  supportsAstroStaticSlot: true
};
var server_default = renderer;
const renderers = [Object.assign({ "name": "@astrojs/preact", "clientEntrypoint": "@astrojs/preact/client.js", "serverEntrypoint": "@astrojs/preact/server.js" }, { ssr: server_default })];
const onRequest = (_, next) => next();
const server = {};
function normalizeLF(code) {
  return code.replace(/\r\n|\r(?!\n)|\n/g, "\n");
}
function codeFrame(src, loc) {
  if (!loc || loc.line === void 0 || loc.column === void 0) {
    return "";
  }
  const lines = normalizeLF(src).split("\n").map((ln) => ln.replace(/\t/g, "  "));
  const visibleLines = [];
  for (let n = -2; n <= 2; n++) {
    if (lines[loc.line + n]) visibleLines.push(loc.line + n);
  }
  let gutterWidth = 0;
  for (const lineNo of visibleLines) {
    let w = `> ${lineNo}`;
    if (w.length > gutterWidth) gutterWidth = w.length;
  }
  let output = "";
  for (const lineNo of visibleLines) {
    const isFocusedLine = lineNo === loc.line - 1;
    output += isFocusedLine ? "> " : "  ";
    output += `${lineNo + 1} | ${lines[lineNo]}
`;
    if (isFocusedLine)
      output += `${Array.from({ length: gutterWidth }).join(" ")}  | ${Array.from({
        length: loc.column
      }).join(" ")}^
`;
  }
  return output;
}
class AstroError extends Error {
  constructor(props, options) {
    const { name, title, message, stack, location, hint, frame } = props;
    super(message, options);
    __publicField(this, "loc");
    __publicField(this, "title");
    __publicField(this, "hint");
    __publicField(this, "frame");
    __publicField(this, "type", "AstroError");
    this.title = title;
    this.name = name;
    if (message) this.message = message;
    this.stack = stack ? stack : this.stack;
    this.loc = location;
    this.hint = hint;
    this.frame = frame;
  }
  setLocation(location) {
    this.loc = location;
  }
  setName(name) {
    this.name = name;
  }
  setMessage(message) {
    this.message = message;
  }
  setHint(hint) {
    this.hint = hint;
  }
  setFrame(source, location) {
    this.frame = codeFrame(source, location);
  }
  static is(err) {
    return (err == null ? void 0 : err.type) === "AstroError";
  }
}
const MissingMediaQueryDirective = {
  name: "MissingMediaQueryDirective",
  title: "Missing value for `client:media` directive.",
  message: 'Media query not provided for `client:media` directive. A media query similar to `client:media="(max-width: 600px)"` must be provided'
};
const NoMatchingRenderer = {
  name: "NoMatchingRenderer",
  title: "No matching renderer found.",
  message: (componentName, componentExtension, plural, validRenderersCount) => `Unable to render \`${componentName}\`.

${validRenderersCount > 0 ? `There ${plural ? "are" : "is"} ${validRenderersCount} renderer${plural ? "s" : ""} configured in your \`astro.config.mjs\` file,
but ${plural ? "none were" : "it was not"} able to server-side render \`${componentName}\`.` : `No valid renderer was found ${componentExtension ? `for the \`.${componentExtension}\` file extension.` : `for this file extension.`}`}`,
  hint: (probableRenderers) => `Did you mean to enable the ${probableRenderers} integration?

See https://docs.astro.build/en/guides/framework-components/ for more information on how to install and configure integrations.`
};
const NoClientOnlyHint = {
  name: "NoClientOnlyHint",
  title: "Missing hint on client:only directive.",
  message: (componentName) => `Unable to render \`${componentName}\`. When using the \`client:only\` hydration strategy, Astro needs a hint to use the correct renderer.`,
  hint: (probableRenderers) => `Did you mean to pass \`client:only="${probableRenderers}"\`? See https://docs.astro.build/en/reference/directives-reference/#clientonly for more information on client:only`
};
const NoMatchingImport = {
  name: "NoMatchingImport",
  title: "No import found for component.",
  message: (componentName) => `Could not render \`${componentName}\`. No matching import has been found for \`${componentName}\`.`,
  hint: "Please make sure the component is properly imported."
};
const InvalidComponentArgs = {
  name: "InvalidComponentArgs",
  title: "Invalid component arguments.",
  message: (name) => `Invalid arguments passed to${name ? ` <${name}>` : ""} component.`,
  hint: "Astro components cannot be rendered directly via function call, such as `Component()` or `{items.map(Component)}`."
};
const AstroGlobUsedOutside = {
  name: "AstroGlobUsedOutside",
  title: "Astro.glob() used outside of an Astro file.",
  message: (globStr) => `\`Astro.glob(${globStr})\` can only be used in \`.astro\` files. \`import.meta.glob(${globStr})\` can be used instead to achieve a similar result.`,
  hint: "See Vite's documentation on `import.meta.glob` for more information: https://vite.dev/guide/features.html#glob-import"
};
const AstroGlobNoMatch = {
  name: "AstroGlobNoMatch",
  title: "Astro.glob() did not match any files.",
  message: (globStr) => `\`Astro.glob(${globStr})\` did not return any matching files.`,
  hint: "Check the pattern for typos."
};
function validateArgs(args) {
  if (args.length !== 3) return false;
  if (!args[0] || typeof args[0] !== "object") return false;
  return true;
}
function baseCreateComponent(cb, moduleId, propagation) {
  var _a2, _b;
  const name = (_b = (_a2 = moduleId == null ? void 0 : moduleId.split("/").pop()) == null ? void 0 : _a2.replace(".astro", "")) != null ? _b : "";
  const fn = (...args) => {
    if (!validateArgs(args)) {
      throw new AstroError(__spreadProps(__spreadValues({}, InvalidComponentArgs), {
        message: InvalidComponentArgs.message(name)
      }));
    }
    return cb(...args);
  };
  Object.defineProperty(fn, "name", { value: name, writable: false });
  fn.isAstroComponentFactory = true;
  fn.moduleId = moduleId;
  fn.propagation = propagation;
  return fn;
}
function createComponentWithOptions(opts) {
  const cb = baseCreateComponent(opts.factory, opts.moduleId, opts.propagation);
  return cb;
}
function createComponent(arg1, moduleId, propagation) {
  if (typeof arg1 === "function") {
    return baseCreateComponent(arg1, moduleId, propagation);
  } else {
    return createComponentWithOptions(arg1);
  }
}
const ASTRO_VERSION = "5.17.2";
const NOOP_MIDDLEWARE_HEADER = "X-Astro-Noop";
function createAstroGlobFn() {
  const globHandler = (importMetaGlobResult) => {
    console.warn(`Astro.glob is deprecated and will be removed in a future major version of Astro.
Use import.meta.glob instead: https://vitejs.dev/guide/features.html#glob-import`);
    if (typeof importMetaGlobResult === "string") {
      throw new AstroError(__spreadProps(__spreadValues({}, AstroGlobUsedOutside), {
        message: AstroGlobUsedOutside.message(JSON.stringify(importMetaGlobResult))
      }));
    }
    let allEntries = [...Object.values(importMetaGlobResult)];
    if (allEntries.length === 0) {
      throw new AstroError(__spreadProps(__spreadValues({}, AstroGlobNoMatch), {
        message: AstroGlobNoMatch.message(JSON.stringify(importMetaGlobResult))
      }));
    }
    return Promise.all(allEntries.map((fn) => fn()));
  };
  return globHandler;
}
function createAstro(site) {
  return {
    site: void 0,
    generator: `Astro v${ASTRO_VERSION}`,
    glob: createAstroGlobFn()
  };
}
function isPromise(value) {
  return !!value && typeof value === "object" && "then" in value && typeof value.then === "function";
}
const escapeHTML = escape;
class HTMLString extends String {
  get [Symbol.toStringTag]() {
    return "HTMLString";
  }
}
const markHTMLString = (value) => {
  if (value instanceof HTMLString) {
    return value;
  }
  if (typeof value === "string") {
    return new HTMLString(value);
  }
  return value;
};
function isHTMLString(value) {
  return Object.prototype.toString.call(value) === "[object HTMLString]";
}
function isAstroComponentFactory(obj) {
  return obj == null ? false : obj.isAstroComponentFactory === true;
}
function isAPropagatingComponent(result, factory) {
  const hint = getPropagationHint(result, factory);
  return hint === "in-tree" || hint === "self";
}
function getPropagationHint(result, factory) {
  let hint = factory.propagation || "none";
  if (factory.moduleId && result.componentMetadata.has(factory.moduleId) && hint === "none") {
    hint = result.componentMetadata.get(factory.moduleId).propagation;
  }
  return hint;
}
const PROP_TYPE = {
  Value: 0,
  JSON: 1,
  // Actually means Array
  RegExp: 2,
  Date: 3,
  Map: 4,
  Set: 5,
  BigInt: 6,
  URL: 7,
  Uint8Array: 8,
  Uint16Array: 9,
  Uint32Array: 10,
  Infinity: 11
};
function serializeArray(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  if (parents.has(value)) {
    throw new Error(`Cyclic reference detected while serializing props for <${metadata.displayName} client:${metadata.hydrate}>!

Cyclic references cannot be safely serialized for client-side usage. Please remove the cyclic reference.`);
  }
  parents.add(value);
  const serialized = value.map((v) => {
    return convertToSerializedForm(v, metadata, parents);
  });
  parents.delete(value);
  return serialized;
}
function serializeObject(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  if (parents.has(value)) {
    throw new Error(`Cyclic reference detected while serializing props for <${metadata.displayName} client:${metadata.hydrate}>!

Cyclic references cannot be safely serialized for client-side usage. Please remove the cyclic reference.`);
  }
  parents.add(value);
  const serialized = Object.fromEntries(
    Object.entries(value).map(([k, v]) => {
      return [k, convertToSerializedForm(v, metadata, parents)];
    })
  );
  parents.delete(value);
  return serialized;
}
function convertToSerializedForm(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  const tag = Object.prototype.toString.call(value);
  switch (tag) {
    case "[object Date]": {
      return [PROP_TYPE.Date, value.toISOString()];
    }
    case "[object RegExp]": {
      return [PROP_TYPE.RegExp, value.source];
    }
    case "[object Map]": {
      return [PROP_TYPE.Map, serializeArray(Array.from(value), metadata, parents)];
    }
    case "[object Set]": {
      return [PROP_TYPE.Set, serializeArray(Array.from(value), metadata, parents)];
    }
    case "[object BigInt]": {
      return [PROP_TYPE.BigInt, value.toString()];
    }
    case "[object URL]": {
      return [PROP_TYPE.URL, value.toString()];
    }
    case "[object Array]": {
      return [PROP_TYPE.JSON, serializeArray(value, metadata, parents)];
    }
    case "[object Uint8Array]": {
      return [PROP_TYPE.Uint8Array, Array.from(value)];
    }
    case "[object Uint16Array]": {
      return [PROP_TYPE.Uint16Array, Array.from(value)];
    }
    case "[object Uint32Array]": {
      return [PROP_TYPE.Uint32Array, Array.from(value)];
    }
    default: {
      if (value !== null && typeof value === "object") {
        return [PROP_TYPE.Value, serializeObject(value, metadata, parents)];
      }
      if (value === Infinity) {
        return [PROP_TYPE.Infinity, 1];
      }
      if (value === -Infinity) {
        return [PROP_TYPE.Infinity, -1];
      }
      if (value === void 0) {
        return [PROP_TYPE.Value];
      }
      return [PROP_TYPE.Value, value];
    }
  }
}
function serializeProps(props, metadata) {
  const serialized = JSON.stringify(serializeObject(props, metadata));
  return serialized;
}
const transitionDirectivesToCopyOnIsland = Object.freeze([
  "data-astro-transition-scope",
  "data-astro-transition-persist",
  "data-astro-transition-persist-props"
]);
function extractDirectives(inputProps, clientDirectives) {
  let extracted = {
    isPage: false,
    hydration: null,
    props: {},
    propsWithoutTransitionAttributes: {}
  };
  for (const [key, value] of Object.entries(inputProps)) {
    if (key.startsWith("server:")) {
      if (key === "server:root") {
        extracted.isPage = true;
      }
    }
    if (key.startsWith("client:")) {
      if (!extracted.hydration) {
        extracted.hydration = {
          directive: "",
          value: "",
          componentUrl: "",
          componentExport: { value: "" }
        };
      }
      switch (key) {
        case "client:component-path": {
          extracted.hydration.componentUrl = value;
          break;
        }
        case "client:component-export": {
          extracted.hydration.componentExport.value = value;
          break;
        }
        // This is a special prop added to prove that the client hydration method
        // was added statically.
        case "client:component-hydration": {
          break;
        }
        case "client:display-name": {
          break;
        }
        default: {
          extracted.hydration.directive = key.split(":")[1];
          extracted.hydration.value = value;
          if (!clientDirectives.has(extracted.hydration.directive)) {
            const hydrationMethods = Array.from(clientDirectives.keys()).map((d) => `client:${d}`).join(", ");
            throw new Error(
              `Error: invalid hydration directive "${key}". Supported hydration methods: ${hydrationMethods}`
            );
          }
          if (extracted.hydration.directive === "media" && typeof extracted.hydration.value !== "string") {
            throw new AstroError(MissingMediaQueryDirective);
          }
          break;
        }
      }
    } else {
      extracted.props[key] = value;
      if (!transitionDirectivesToCopyOnIsland.includes(key)) {
        extracted.propsWithoutTransitionAttributes[key] = value;
      }
    }
  }
  for (const sym of Object.getOwnPropertySymbols(inputProps)) {
    extracted.props[sym] = inputProps[sym];
    extracted.propsWithoutTransitionAttributes[sym] = inputProps[sym];
  }
  return extracted;
}
async function generateHydrateScript(scriptOptions, metadata) {
  const { renderer: renderer2, result, astroId, props, attrs } = scriptOptions;
  const { hydrate, componentUrl, componentExport } = metadata;
  if (!componentExport.value) {
    throw new AstroError(__spreadProps(__spreadValues({}, NoMatchingImport), {
      message: NoMatchingImport.message(metadata.displayName)
    }));
  }
  const island = {
    children: "",
    props: {
      // This is for HMR, probably can avoid it in prod
      uid: astroId
    }
  };
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      island.props[key] = escapeHTML(value);
    }
  }
  island.props["component-url"] = await result.resolve(decodeURI(componentUrl));
  if (renderer2.clientEntrypoint) {
    island.props["component-export"] = componentExport.value;
    island.props["renderer-url"] = await result.resolve(
      decodeURI(renderer2.clientEntrypoint.toString())
    );
    island.props["props"] = escapeHTML(serializeProps(props, metadata));
  }
  island.props["ssr"] = "";
  island.props["client"] = hydrate;
  let beforeHydrationUrl = await result.resolve("astro:scripts/before-hydration.js");
  if (beforeHydrationUrl.length) {
    island.props["before-hydration-url"] = beforeHydrationUrl;
  }
  island.props["opts"] = escapeHTML(
    JSON.stringify({
      name: metadata.displayName,
      value: metadata.hydrateArgs || ""
    })
  );
  transitionDirectivesToCopyOnIsland.forEach((name) => {
    if (typeof props[name] !== "undefined") {
      island.props[name] = props[name];
    }
  });
  return island;
}
/**
 * shortdash - https://github.com/bibig/node-shorthash
 *
 * @license
 *
 * (The MIT License)
 *
 * Copyright (c) 2013 Bibig <bibig@me.com>
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */
const dictionary = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY";
const binary = dictionary.length;
function bitwise(str) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash = hash & hash;
  }
  return hash;
}
function shorthash(text) {
  let num;
  let result = "";
  let integer = bitwise(text);
  const sign = integer < 0 ? "Z" : "";
  integer = Math.abs(integer);
  while (integer >= binary) {
    num = integer % binary;
    integer = Math.floor(integer / binary);
    result = dictionary[num] + result;
  }
  if (integer > 0) {
    result = dictionary[integer] + result;
  }
  return sign + result;
}
const headAndContentSym = Symbol.for("astro.headAndContent");
function isHeadAndContent(obj) {
  return typeof obj === "object" && obj !== null && !!obj[headAndContentSym];
}
function createThinHead() {
  return {
    [headAndContentSym]: true
  };
}
var astro_island_prebuilt_default = `(()=>{var A=Object.defineProperty;var g=(i,o,a)=>o in i?A(i,o,{enumerable:!0,configurable:!0,writable:!0,value:a}):i[o]=a;var d=(i,o,a)=>g(i,typeof o!="symbol"?o+"":o,a);{let i={0:t=>m(t),1:t=>a(t),2:t=>new RegExp(t),3:t=>new Date(t),4:t=>new Map(a(t)),5:t=>new Set(a(t)),6:t=>BigInt(t),7:t=>new URL(t),8:t=>new Uint8Array(t),9:t=>new Uint16Array(t),10:t=>new Uint32Array(t),11:t=>1/0*t},o=t=>{let[l,e]=t;return l in i?i[l](e):void 0},a=t=>t.map(o),m=t=>typeof t!="object"||t===null?t:Object.fromEntries(Object.entries(t).map(([l,e])=>[l,o(e)]));class y extends HTMLElement{constructor(){super(...arguments);d(this,"Component");d(this,"hydrator");d(this,"hydrate",async()=>{var b;if(!this.hydrator||!this.isConnected)return;let e=(b=this.parentElement)==null?void 0:b.closest("astro-island[ssr]");if(e){e.addEventListener("astro:hydrate",this.hydrate,{once:!0});return}let c=this.querySelectorAll("astro-slot"),n={},h=this.querySelectorAll("template[data-astro-template]");for(let r of h){let s=r.closest(this.tagName);s!=null&&s.isSameNode(this)&&(n[r.getAttribute("data-astro-template")||"default"]=r.innerHTML,r.remove())}for(let r of c){let s=r.closest(this.tagName);s!=null&&s.isSameNode(this)&&(n[r.getAttribute("name")||"default"]=r.innerHTML)}let p;try{p=this.hasAttribute("props")?m(JSON.parse(this.getAttribute("props"))):{}}catch(r){let s=this.getAttribute("component-url")||"<unknown>",v=this.getAttribute("component-export");throw v&&(s+=\` (export \${v})\`),console.error(\`[hydrate] Error parsing props for component \${s}\`,this.getAttribute("props"),r),r}let u;await this.hydrator(this)(this.Component,p,n,{client:this.getAttribute("client")}),this.removeAttribute("ssr"),this.dispatchEvent(new CustomEvent("astro:hydrate"))});d(this,"unmount",()=>{this.isConnected||this.dispatchEvent(new CustomEvent("astro:unmount"))})}disconnectedCallback(){document.removeEventListener("astro:after-swap",this.unmount),document.addEventListener("astro:after-swap",this.unmount,{once:!0})}connectedCallback(){if(!this.hasAttribute("await-children")||document.readyState==="interactive"||document.readyState==="complete")this.childrenConnectedCallback();else{let e=()=>{document.removeEventListener("DOMContentLoaded",e),c.disconnect(),this.childrenConnectedCallback()},c=new MutationObserver(()=>{var n;((n=this.lastChild)==null?void 0:n.nodeType)===Node.COMMENT_NODE&&this.lastChild.nodeValue==="astro:end"&&(this.lastChild.remove(),e())});c.observe(this,{childList:!0}),document.addEventListener("DOMContentLoaded",e)}}async childrenConnectedCallback(){let e=this.getAttribute("before-hydration-url");e&&await import(e),this.start()}async start(){let e=JSON.parse(this.getAttribute("opts")),c=this.getAttribute("client");if(Astro[c]===void 0){window.addEventListener(\`astro:\${c}\`,()=>this.start(),{once:!0});return}try{await Astro[c](async()=>{let n=this.getAttribute("renderer-url"),[h,{default:p}]=await Promise.all([import(this.getAttribute("component-url")),n?import(n):()=>()=>{}]),u=this.getAttribute("component-export")||"default";if(!u.includes("."))this.Component=h[u];else{this.Component=h;for(let f of u.split("."))this.Component=this.Component[f]}return this.hydrator=p,this.hydrate},e,this)}catch(n){console.error(\`[astro-island] Error hydrating \${this.getAttribute("component-url")}\`,n)}}attributeChangedCallback(){this.hydrate()}}d(y,"observedAttributes",["props"]),customElements.get("astro-island")||customElements.define("astro-island",y)}})();`;
var astro_island_prebuilt_dev_default = `(()=>{var A=Object.defineProperty;var g=(i,o,a)=>o in i?A(i,o,{enumerable:!0,configurable:!0,writable:!0,value:a}):i[o]=a;var l=(i,o,a)=>g(i,typeof o!="symbol"?o+"":o,a);{let i={0:t=>y(t),1:t=>a(t),2:t=>new RegExp(t),3:t=>new Date(t),4:t=>new Map(a(t)),5:t=>new Set(a(t)),6:t=>BigInt(t),7:t=>new URL(t),8:t=>new Uint8Array(t),9:t=>new Uint16Array(t),10:t=>new Uint32Array(t),11:t=>1/0*t},o=t=>{let[h,e]=t;return h in i?i[h](e):void 0},a=t=>t.map(o),y=t=>typeof t!="object"||t===null?t:Object.fromEntries(Object.entries(t).map(([h,e])=>[h,o(e)]));class f extends HTMLElement{constructor(){super(...arguments);l(this,"Component");l(this,"hydrator");l(this,"hydrate",async()=>{var b;if(!this.hydrator||!this.isConnected)return;let e=(b=this.parentElement)==null?void 0:b.closest("astro-island[ssr]");if(e){e.addEventListener("astro:hydrate",this.hydrate,{once:!0});return}let c=this.querySelectorAll("astro-slot"),n={},p=this.querySelectorAll("template[data-astro-template]");for(let r of p){let s=r.closest(this.tagName);s!=null&&s.isSameNode(this)&&(n[r.getAttribute("data-astro-template")||"default"]=r.innerHTML,r.remove())}for(let r of c){let s=r.closest(this.tagName);s!=null&&s.isSameNode(this)&&(n[r.getAttribute("name")||"default"]=r.innerHTML)}let u;try{u=this.hasAttribute("props")?y(JSON.parse(this.getAttribute("props"))):{}}catch(r){let s=this.getAttribute("component-url")||"<unknown>",v=this.getAttribute("component-export");throw v&&(s+=\` (export \${v})\`),console.error(\`[hydrate] Error parsing props for component \${s}\`,this.getAttribute("props"),r),r}let d,m=this.hydrator(this);d=performance.now(),await m(this.Component,u,n,{client:this.getAttribute("client")}),d&&this.setAttribute("client-render-time",(performance.now()-d).toString()),this.removeAttribute("ssr"),this.dispatchEvent(new CustomEvent("astro:hydrate"))});l(this,"unmount",()=>{this.isConnected||this.dispatchEvent(new CustomEvent("astro:unmount"))})}disconnectedCallback(){document.removeEventListener("astro:after-swap",this.unmount),document.addEventListener("astro:after-swap",this.unmount,{once:!0})}connectedCallback(){if(!this.hasAttribute("await-children")||document.readyState==="interactive"||document.readyState==="complete")this.childrenConnectedCallback();else{let e=()=>{document.removeEventListener("DOMContentLoaded",e),c.disconnect(),this.childrenConnectedCallback()},c=new MutationObserver(()=>{var n;((n=this.lastChild)==null?void 0:n.nodeType)===Node.COMMENT_NODE&&this.lastChild.nodeValue==="astro:end"&&(this.lastChild.remove(),e())});c.observe(this,{childList:!0}),document.addEventListener("DOMContentLoaded",e)}}async childrenConnectedCallback(){let e=this.getAttribute("before-hydration-url");e&&await import(e),this.start()}async start(){let e=JSON.parse(this.getAttribute("opts")),c=this.getAttribute("client");if(Astro[c]===void 0){window.addEventListener(\`astro:\${c}\`,()=>this.start(),{once:!0});return}try{await Astro[c](async()=>{let n=this.getAttribute("renderer-url"),[p,{default:u}]=await Promise.all([import(this.getAttribute("component-url")),n?import(n):()=>()=>{}]),d=this.getAttribute("component-export")||"default";if(!d.includes("."))this.Component=p[d];else{this.Component=p;for(let m of d.split("."))this.Component=this.Component[m]}return this.hydrator=u,this.hydrate},e,this)}catch(n){console.error(\`[astro-island] Error hydrating \${this.getAttribute("component-url")}\`,n)}}attributeChangedCallback(){this.hydrate()}}l(f,"observedAttributes",["props"]),customElements.get("astro-island")||customElements.define("astro-island",f)}})();`;
const ISLAND_STYLES = "astro-island,astro-slot,astro-static-slot{display:contents}";
function determineIfNeedsHydrationScript(result) {
  if (result._metadata.hasHydrationScript) {
    return false;
  }
  return result._metadata.hasHydrationScript = true;
}
function determinesIfNeedsDirectiveScript(result, directive) {
  if (result._metadata.hasDirectives.has(directive)) {
    return false;
  }
  result._metadata.hasDirectives.add(directive);
  return true;
}
function getDirectiveScriptText(result, directive) {
  const clientDirectives = result.clientDirectives;
  const clientDirective = clientDirectives.get(directive);
  if (!clientDirective) {
    throw new Error(`Unknown directive: ${directive}`);
  }
  return clientDirective;
}
function getPrescripts(result, type, directive) {
  switch (type) {
    case "both":
      return `<style>${ISLAND_STYLES}</style><script>${getDirectiveScriptText(result, directive)}<\/script><script>${process.env.NODE_ENV === "development" ? astro_island_prebuilt_dev_default : astro_island_prebuilt_default}<\/script>`;
    case "directive":
      return `<script>${getDirectiveScriptText(result, directive)}<\/script>`;
  }
}
function renderCspContent(result) {
  const finalScriptHashes = /* @__PURE__ */ new Set();
  const finalStyleHashes = /* @__PURE__ */ new Set();
  for (const scriptHash of result.scriptHashes) {
    finalScriptHashes.add(`'${scriptHash}'`);
  }
  for (const styleHash of result.styleHashes) {
    finalStyleHashes.add(`'${styleHash}'`);
  }
  for (const styleHash of result._metadata.extraStyleHashes) {
    finalStyleHashes.add(`'${styleHash}'`);
  }
  for (const scriptHash of result._metadata.extraScriptHashes) {
    finalScriptHashes.add(`'${scriptHash}'`);
  }
  let directives;
  if (result.directives.length > 0) {
    directives = result.directives.join(";") + ";";
  }
  let scriptResources = "'self'";
  if (result.scriptResources.length > 0) {
    scriptResources = result.scriptResources.map((r) => `${r}`).join(" ");
  }
  let styleResources = "'self'";
  if (result.styleResources.length > 0) {
    styleResources = result.styleResources.map((r) => `${r}`).join(" ");
  }
  const strictDynamic = result.isStrictDynamic ? ` 'strict-dynamic'` : "";
  const scriptSrc = `script-src ${scriptResources} ${Array.from(finalScriptHashes).join(" ")}${strictDynamic};`;
  const styleSrc = `style-src ${styleResources} ${Array.from(finalStyleHashes).join(" ")};`;
  return [directives, scriptSrc, styleSrc].filter(Boolean).join(" ");
}
const RenderInstructionSymbol = Symbol.for("astro:render");
function createRenderInstruction(instruction) {
  return Object.defineProperty(instruction, RenderInstructionSymbol, {
    value: true
  });
}
function isRenderInstruction(chunk) {
  return chunk && typeof chunk === "object" && chunk[RenderInstructionSymbol];
}
const voidElementNames = /^(area|base|br|col|command|embed|hr|img|input|keygen|link|meta|param|source|track|wbr)$/i;
const htmlBooleanAttributes = /^(?:allowfullscreen|async|autofocus|autoplay|checked|controls|default|defer|disabled|disablepictureinpicture|disableremoteplayback|formnovalidate|hidden|inert|loop|muted|nomodule|novalidate|open|playsinline|readonly|required|reversed|scoped|seamless|selected|itemscope)$/i;
const AMPERSAND_REGEX = /&/g;
const DOUBLE_QUOTE_REGEX = /"/g;
const STATIC_DIRECTIVES = /* @__PURE__ */ new Set(["set:html", "set:text"]);
const toIdent = (k) => k.trim().replace(/(?!^)\b\w|\s+|\W+/g, (match, index) => {
  if (/\W/.test(match)) return "";
  return index === 0 ? match : match.toUpperCase();
});
const toAttributeString = (value, shouldEscape = true) => shouldEscape ? String(value).replace(AMPERSAND_REGEX, "&#38;").replace(DOUBLE_QUOTE_REGEX, "&#34;") : value;
const kebab = (k) => k.toLowerCase() === k ? k : k.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
const toStyleString = (obj) => Object.entries(obj).filter(([_, v]) => typeof v === "string" && v.trim() || typeof v === "number").map(([k, v]) => {
  if (k[0] !== "-" && k[1] !== "-") return `${kebab(k)}:${v}`;
  return `${k}:${v}`;
}).join(";");
function defineScriptVars(vars) {
  var _a2;
  let output = "";
  for (const [key, value] of Object.entries(vars)) {
    output += `const ${toIdent(key)} = ${(_a2 = JSON.stringify(value)) == null ? void 0 : _a2.replace(
      /<\/script>/g,
      "\\x3C/script>"
    )};
`;
  }
  return markHTMLString(output);
}
function formatList(values) {
  if (values.length === 1) {
    return values[0];
  }
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}
function isCustomElement(tagName) {
  return tagName.includes("-");
}
function handleBooleanAttribute(key, value, shouldEscape, tagName) {
  if (tagName && isCustomElement(tagName)) {
    return markHTMLString(` ${key}="${toAttributeString(value, shouldEscape)}"`);
  }
  return markHTMLString(value ? ` ${key}` : "");
}
function addAttribute(value, key, shouldEscape = true, tagName = "") {
  if (value == null) {
    return "";
  }
  if (STATIC_DIRECTIVES.has(key)) {
    console.warn(`[astro] The "${key}" directive cannot be applied dynamically at runtime. It will not be rendered as an attribute.

Make sure to use the static attribute syntax (\`${key}={value}\`) instead of the dynamic spread syntax (\`{...{ "${key}": value }}\`).`);
    return "";
  }
  if (key === "class:list") {
    const listValue = toAttributeString(clsx(value), shouldEscape);
    if (listValue === "") {
      return "";
    }
    return markHTMLString(` ${key.slice(0, -5)}="${listValue}"`);
  }
  if (key === "style" && !(value instanceof HTMLString)) {
    if (Array.isArray(value) && value.length === 2) {
      return markHTMLString(
        ` ${key}="${toAttributeString(`${toStyleString(value[0])};${value[1]}`, shouldEscape)}"`
      );
    }
    if (typeof value === "object") {
      return markHTMLString(` ${key}="${toAttributeString(toStyleString(value), shouldEscape)}"`);
    }
  }
  if (key === "className") {
    return markHTMLString(` class="${toAttributeString(value, shouldEscape)}"`);
  }
  if (typeof value === "string" && value.includes("&") && isHttpUrl(value)) {
    return markHTMLString(` ${key}="${toAttributeString(value, false)}"`);
  }
  if (htmlBooleanAttributes.test(key)) {
    return handleBooleanAttribute(key, value, shouldEscape, tagName);
  }
  if (value === "") {
    return markHTMLString(` ${key}`);
  }
  if (key === "popover" && typeof value === "boolean") {
    return handleBooleanAttribute(key, value, shouldEscape, tagName);
  }
  if (key === "download" && typeof value === "boolean") {
    return handleBooleanAttribute(key, value, shouldEscape, tagName);
  }
  return markHTMLString(` ${key}="${toAttributeString(value, shouldEscape)}"`);
}
function internalSpreadAttributes(values, shouldEscape = true, tagName) {
  let output = "";
  for (const [key, value] of Object.entries(values)) {
    output += addAttribute(value, key, shouldEscape, tagName);
  }
  return markHTMLString(output);
}
function renderElement(name, { props: _props, children = "" }, shouldEscape = true) {
  const _a2 = _props, { lang: _, "data-astro-id": astroId, "define:vars": defineVars } = _a2, props = __objRest(_a2, ["lang", "data-astro-id", "define:vars"]);
  if (defineVars) {
    if (name === "style") {
      delete props["is:global"];
      delete props["is:scoped"];
    }
    if (name === "script") {
      delete props.hoist;
      children = defineScriptVars(defineVars) + "\n" + children;
    }
  }
  if ((children == null || children == "") && voidElementNames.test(name)) {
    return `<${name}${internalSpreadAttributes(props, shouldEscape, name)}>`;
  }
  return `<${name}${internalSpreadAttributes(props, shouldEscape, name)}>${children}</${name}>`;
}
const noop = () => {
};
class BufferedRenderer {
  constructor(destination, renderFunction) {
    __publicField(this, "chunks", []);
    __publicField(this, "renderPromise");
    __publicField(this, "destination");
    /**
     * Determines whether buffer has been flushed
     * to the final destination.
     */
    __publicField(this, "flushed", false);
    this.destination = destination;
    this.renderPromise = renderFunction(this);
    if (isPromise(this.renderPromise)) {
      Promise.resolve(this.renderPromise).catch(noop);
    }
  }
  write(chunk) {
    if (this.flushed) {
      this.destination.write(chunk);
    } else {
      this.chunks.push(chunk);
    }
  }
  flush() {
    if (this.flushed) {
      throw new Error("The render buffer has already been flushed.");
    }
    this.flushed = true;
    for (const chunk of this.chunks) {
      this.destination.write(chunk);
    }
    return this.renderPromise;
  }
}
function createBufferedRenderer(destination, renderFunction) {
  return new BufferedRenderer(destination, renderFunction);
}
typeof process !== "undefined" && Object.prototype.toString.call(process) === "[object process]";
const VALID_PROTOCOLS = ["http:", "https:"];
function isHttpUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return VALID_PROTOCOLS.includes(parsedUrl.protocol);
  } catch (e) {
    return false;
  }
}
const uniqueElements = (item, index, all) => {
  const props = JSON.stringify(item.props);
  const children = item.children;
  return index === all.findIndex((i) => JSON.stringify(i.props) === props && i.children == children);
};
function renderAllHeadContent(result) {
  result._metadata.hasRenderedHead = true;
  let content = "";
  if (result.shouldInjectCspMetaTags && result.cspDestination === "meta") {
    content += renderElement(
      "meta",
      {
        props: {
          "http-equiv": "content-security-policy",
          content: renderCspContent(result)
        },
        children: ""
      },
      false
    );
  }
  const styles = Array.from(result.styles).filter(uniqueElements).map(
    (style) => style.props.rel === "stylesheet" ? renderElement("link", style) : renderElement("style", style)
  );
  result.styles.clear();
  const scripts = Array.from(result.scripts).filter(uniqueElements).map((script) => {
    if (result.userAssetsBase) {
      script.props.src = (result.base === "/" ? "" : result.base) + result.userAssetsBase + script.props.src;
    }
    return renderElement("script", script, false);
  });
  const links = Array.from(result.links).filter(uniqueElements).map((link) => renderElement("link", link, false));
  content += styles.join("\n") + links.join("\n") + scripts.join("\n");
  if (result._metadata.extraHead.length > 0) {
    for (const part of result._metadata.extraHead) {
      content += part;
    }
  }
  return markHTMLString(content);
}
function renderHead() {
  return createRenderInstruction({ type: "head" });
}
function maybeRenderHead() {
  return createRenderInstruction({ type: "maybe-head" });
}
const ALGORITHMS = {
  "SHA-256": "sha256-",
  "SHA-384": "sha384-",
  "SHA-512": "sha512-"
};
const ALGORITHM_VALUES = Object.values(ALGORITHMS);
z.enum(Object.keys(ALGORITHMS)).optional().default("SHA-256");
z.custom((value) => {
  if (typeof value !== "string") {
    return false;
  }
  return ALGORITHM_VALUES.some((allowedValue) => {
    return value.startsWith(allowedValue);
  });
});
const ALLOWED_DIRECTIVES = [
  "base-uri",
  "child-src",
  "connect-src",
  "default-src",
  "fenced-frame-src",
  "font-src",
  "form-action",
  "frame-ancestors",
  "frame-src",
  "img-src",
  "manifest-src",
  "media-src",
  "object-src",
  "referrer",
  "report-to",
  "report-uri",
  "require-trusted-types-for",
  "sandbox",
  "trusted-types",
  "upgrade-insecure-requests",
  "worker-src"
];
z.custom((value) => {
  if (typeof value !== "string") {
    return false;
  }
  return ALLOWED_DIRECTIVES.some((allowedValue) => {
    return value.startsWith(allowedValue);
  });
});
const ALGORITHM = "AES-GCM";
async function decodeKey(encoded) {
  const bytes = decodeBase64(encoded);
  return crypto.subtle.importKey("raw", bytes.buffer, ALGORITHM, true, [
    "encrypt",
    "decrypt"
  ]);
}
const encoder = new TextEncoder();
new TextDecoder();
const IV_LENGTH = 24;
async function encryptString(key, raw) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH / 2));
  const data = encoder.encode(raw);
  const buffer = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv
    },
    key,
    data
  );
  return encodeHexUpperCase(iv) + encodeBase64(new Uint8Array(buffer));
}
async function generateCspDigest(data, algorithm) {
  const hashBuffer = await crypto.subtle.digest(algorithm, encoder.encode(data));
  const hash = encodeBase64(new Uint8Array(hashBuffer));
  return `${ALGORITHMS[algorithm]}${hash}`;
}
const renderTemplateResultSym = Symbol.for("astro.renderTemplateResult");
_c = renderTemplateResultSym;
class RenderTemplateResult {
  constructor(htmlParts, expressions) {
    __publicField(this, _c, true);
    __publicField(this, "htmlParts");
    __publicField(this, "expressions");
    __publicField(this, "error");
    this.htmlParts = htmlParts;
    this.error = void 0;
    this.expressions = expressions.map((expression) => {
      if (isPromise(expression)) {
        return Promise.resolve(expression).catch((err) => {
          if (!this.error) {
            this.error = err;
            throw err;
          }
        });
      }
      return expression;
    });
  }
  render(destination) {
    const flushers = this.expressions.map((exp) => {
      return createBufferedRenderer(destination, (bufferDestination) => {
        if (exp || exp === 0) {
          return renderChild(bufferDestination, exp);
        }
      });
    });
    let i = 0;
    const iterate = () => {
      while (i < this.htmlParts.length) {
        const html = this.htmlParts[i];
        const flusher = flushers[i];
        i++;
        if (html) {
          destination.write(markHTMLString(html));
        }
        if (flusher) {
          const result = flusher.flush();
          if (isPromise(result)) {
            return result.then(iterate);
          }
        }
      }
    };
    return iterate();
  }
}
function isRenderTemplateResult(obj) {
  return typeof obj === "object" && obj !== null && !!obj[renderTemplateResultSym];
}
function renderTemplate(htmlParts, ...expressions) {
  return new RenderTemplateResult(htmlParts, expressions);
}
const slotString = Symbol.for("astro:slot-string");
class SlotString extends (_e = HTMLString, _d = slotString, _e) {
  constructor(content, instructions) {
    super(content);
    __publicField(this, "instructions");
    __publicField(this, _d);
    this.instructions = instructions;
    this[slotString] = true;
  }
}
function isSlotString(str) {
  return !!str[slotString];
}
function mergeSlotInstructions(target, source) {
  var _a2;
  if ((_a2 = source.instructions) == null ? void 0 : _a2.length) {
    target != null ? target : target = [];
    target.push(...source.instructions);
  }
  return target;
}
function renderSlot(result, slotted, fallback) {
  if (!slotted && fallback) {
    return renderSlot(result, fallback);
  }
  return {
    async render(destination) {
      await renderChild(destination, typeof slotted === "function" ? slotted(result) : slotted);
    }
  };
}
async function renderSlotToString(result, slotted, fallback) {
  let content = "";
  let instructions = null;
  const temporaryDestination = {
    write(chunk) {
      if (chunk instanceof SlotString) {
        content += chunk;
        instructions = mergeSlotInstructions(instructions, chunk);
      } else if (chunk instanceof Response) return;
      else if (typeof chunk === "object" && "type" in chunk && typeof chunk.type === "string") {
        if (instructions === null) {
          instructions = [];
        }
        instructions.push(chunk);
      } else {
        content += chunkToString(result, chunk);
      }
    }
  };
  const renderInstance = renderSlot(result, slotted, fallback);
  await renderInstance.render(temporaryDestination);
  return markHTMLString(new SlotString(content, instructions));
}
async function renderSlots(result, slots = {}) {
  let slotInstructions = null;
  let children = {};
  if (slots) {
    await Promise.all(
      Object.entries(slots).map(
        ([key, value]) => renderSlotToString(result, value).then((output) => {
          if (output.instructions) {
            if (slotInstructions === null) {
              slotInstructions = [];
            }
            slotInstructions.push(...output.instructions);
          }
          children[key] = output;
        })
      )
    );
  }
  return { slotInstructions, children };
}
const internalProps = /* @__PURE__ */ new Set([
  "server:component-path",
  "server:component-export",
  "server:component-directive",
  "server:defer"
]);
function containsServerDirective(props) {
  return "server:component-directive" in props;
}
const SCRIPT_RE = /<\/script/giu;
const COMMENT_RE = /<!--/gu;
const SCRIPT_REPLACER = "<\\/script";
const COMMENT_REPLACER = "\\u003C!--";
function safeJsonStringify(obj) {
  return JSON.stringify(obj).replace(SCRIPT_RE, SCRIPT_REPLACER).replace(COMMENT_RE, COMMENT_REPLACER);
}
function createSearchParams(encryptedComponentExport, encryptedProps, slots) {
  const params = new URLSearchParams();
  params.set("e", encryptedComponentExport);
  params.set("p", encryptedProps);
  params.set("s", slots);
  return params;
}
function isWithinURLLimit(pathname, params) {
  const url = pathname + "?" + params.toString();
  const chars = url.length;
  return chars < 2048;
}
class ServerIslandComponent {
  constructor(result, props, slots, displayName) {
    __publicField(this, "result");
    __publicField(this, "props");
    __publicField(this, "slots");
    __publicField(this, "displayName");
    __publicField(this, "hostId");
    __publicField(this, "islandContent");
    __publicField(this, "componentPath");
    __publicField(this, "componentExport");
    __publicField(this, "componentId");
    this.result = result;
    this.props = props;
    this.slots = slots;
    this.displayName = displayName;
  }
  async init() {
    const content = await this.getIslandContent();
    if (this.result.cspDestination) {
      this.result._metadata.extraScriptHashes.push(
        await generateCspDigest(SERVER_ISLAND_REPLACER, this.result.cspAlgorithm)
      );
      const contentDigest = await generateCspDigest(content, this.result.cspAlgorithm);
      this.result._metadata.extraScriptHashes.push(contentDigest);
    }
    return createThinHead();
  }
  async render(destination) {
    const hostId = await this.getHostId();
    const islandContent = await this.getIslandContent();
    destination.write(createRenderInstruction({ type: "server-island-runtime" }));
    destination.write("<!--[if astro]>server-island-start<![endif]-->");
    for (const name in this.slots) {
      if (name === "fallback") {
        await renderChild(destination, this.slots.fallback(this.result));
      }
    }
    destination.write(
      `<script type="module" data-astro-rerun data-island-id="${hostId}">${islandContent}<\/script>`
    );
  }
  getComponentPath() {
    if (this.componentPath) {
      return this.componentPath;
    }
    const componentPath = this.props["server:component-path"];
    if (!componentPath) {
      throw new Error(`Could not find server component path`);
    }
    this.componentPath = componentPath;
    return componentPath;
  }
  getComponentExport() {
    if (this.componentExport) {
      return this.componentExport;
    }
    const componentExport = this.props["server:component-export"];
    if (!componentExport) {
      throw new Error(`Could not find server component export`);
    }
    this.componentExport = componentExport;
    return componentExport;
  }
  async getHostId() {
    if (!this.hostId) {
      this.hostId = await crypto.randomUUID();
    }
    return this.hostId;
  }
  async getIslandContent() {
    if (this.islandContent) {
      return this.islandContent;
    }
    const componentPath = this.getComponentPath();
    const componentExport = this.getComponentExport();
    const componentId = this.result.serverIslandNameMap.get(componentPath);
    if (!componentId) {
      throw new Error(`Could not find server component name`);
    }
    for (const key2 of Object.keys(this.props)) {
      if (internalProps.has(key2)) {
        delete this.props[key2];
      }
    }
    const renderedSlots = {};
    for (const name in this.slots) {
      if (name !== "fallback") {
        const content = await renderSlotToString(this.result, this.slots[name]);
        renderedSlots[name] = content.toString();
      }
    }
    const key = await this.result.key;
    const componentExportEncrypted = await encryptString(key, componentExport);
    const propsEncrypted = Object.keys(this.props).length === 0 ? "" : await encryptString(key, JSON.stringify(this.props));
    const slotsEncrypted = Object.keys(renderedSlots).length === 0 ? "" : await encryptString(key, JSON.stringify(renderedSlots));
    const hostId = await this.getHostId();
    const slash = this.result.base.endsWith("/") ? "" : "/";
    let serverIslandUrl = `${this.result.base}${slash}_server-islands/${componentId}${this.result.trailingSlash === "always" ? "/" : ""}`;
    const potentialSearchParams = createSearchParams(
      componentExportEncrypted,
      propsEncrypted,
      slotsEncrypted
    );
    const useGETRequest = isWithinURLLimit(serverIslandUrl, potentialSearchParams);
    if (useGETRequest) {
      serverIslandUrl += "?" + potentialSearchParams.toString();
      this.result._metadata.extraHead.push(
        markHTMLString(
          `<link rel="preload" as="fetch" href="${serverIslandUrl}" crossorigin="anonymous">`
        )
      );
    }
    const adapterHeaders = this.result.internalFetchHeaders || {};
    const headersJson = safeJsonStringify(adapterHeaders);
    const method = useGETRequest ? (
      // GET request
      `const headers = new Headers(${headersJson});
let response = await fetch('${serverIslandUrl}', { headers });`
    ) : (
      // POST request
      `let data = {
	encryptedComponentExport: ${safeJsonStringify(componentExportEncrypted)},
	encryptedProps: ${safeJsonStringify(propsEncrypted)},
	encryptedSlots: ${safeJsonStringify(slotsEncrypted)},
};
const headers = new Headers({ 'Content-Type': 'application/json', ...${headersJson} });
let response = await fetch('${serverIslandUrl}', {
	method: 'POST',
	body: JSON.stringify(data),
	headers,
});`
    );
    this.islandContent = `${method}replaceServerIsland('${hostId}', response);`;
    return this.islandContent;
  }
}
const renderServerIslandRuntime = () => {
  return `<script>${SERVER_ISLAND_REPLACER}<\/script>`;
};
const SERVER_ISLAND_REPLACER = markHTMLString(
  `async function replaceServerIsland(id, r) {
	let s = document.querySelector(\`script[data-island-id="\${id}"]\`);
	// If there's no matching script, or the request fails then return
	if (!s || r.status !== 200 || r.headers.get('content-type')?.split(';')[0].trim() !== 'text/html') return;
	// Load the HTML before modifying the DOM in case of errors
	let html = await r.text();
	// Remove any placeholder content before the island script
	while (s.previousSibling && s.previousSibling.nodeType !== 8 && s.previousSibling.data !== '[if astro]>server-island-start<![endif]')
		s.previousSibling.remove();
	s.previousSibling?.remove();
	// Insert the new HTML
	s.before(document.createRange().createContextualFragment(html));
	// Remove the script. Prior to v5.4.2, this was the trick to force rerun of scripts.  Keeping it to minimize change to the existing behavior.
	s.remove();
}`.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//")).join(" ")
);
const Fragment = Symbol.for("astro:fragment");
const Renderer = Symbol.for("astro:renderer");
new TextEncoder();
const decoder = new TextDecoder();
function stringifyChunk(result, chunk) {
  if (isRenderInstruction(chunk)) {
    const instruction = chunk;
    switch (instruction.type) {
      case "directive": {
        const { hydration } = instruction;
        let needsHydrationScript = hydration && determineIfNeedsHydrationScript(result);
        let needsDirectiveScript = hydration && determinesIfNeedsDirectiveScript(result, hydration.directive);
        if (needsHydrationScript) {
          let prescripts = getPrescripts(result, "both", hydration.directive);
          return markHTMLString(prescripts);
        } else if (needsDirectiveScript) {
          let prescripts = getPrescripts(result, "directive", hydration.directive);
          return markHTMLString(prescripts);
        } else {
          return "";
        }
      }
      case "head": {
        if (result._metadata.hasRenderedHead || result.partial) {
          return "";
        }
        return renderAllHeadContent(result);
      }
      case "maybe-head": {
        if (result._metadata.hasRenderedHead || result._metadata.headInTree || result.partial) {
          return "";
        }
        return renderAllHeadContent(result);
      }
      case "renderer-hydration-script": {
        const { rendererSpecificHydrationScripts } = result._metadata;
        const { rendererName } = instruction;
        if (!rendererSpecificHydrationScripts.has(rendererName)) {
          rendererSpecificHydrationScripts.add(rendererName);
          return instruction.render();
        }
        return "";
      }
      case "server-island-runtime": {
        if (result._metadata.hasRenderedServerIslandRuntime) {
          return "";
        }
        result._metadata.hasRenderedServerIslandRuntime = true;
        return renderServerIslandRuntime();
      }
      case "script": {
        const { id, content } = instruction;
        if (result._metadata.renderedScripts.has(id)) {
          return "";
        }
        result._metadata.renderedScripts.add(id);
        return content;
      }
      default: {
        throw new Error(`Unknown chunk type: ${chunk.type}`);
      }
    }
  } else if (chunk instanceof Response) {
    return "";
  } else if (isSlotString(chunk)) {
    let out = "";
    const c = chunk;
    if (c.instructions) {
      for (const instr of c.instructions) {
        out += stringifyChunk(result, instr);
      }
    }
    out += chunk.toString();
    return out;
  }
  return chunk.toString();
}
function chunkToString(result, chunk) {
  if (ArrayBuffer.isView(chunk)) {
    return decoder.decode(chunk);
  } else {
    return stringifyChunk(result, chunk);
  }
}
function isRenderInstance(obj) {
  return !!obj && typeof obj === "object" && "render" in obj && typeof obj.render === "function";
}
function renderChild(destination, child) {
  if (isPromise(child)) {
    return child.then((x) => renderChild(destination, x));
  }
  if (child instanceof SlotString) {
    destination.write(child);
    return;
  }
  if (isHTMLString(child)) {
    destination.write(child);
    return;
  }
  if (Array.isArray(child)) {
    return renderArray(destination, child);
  }
  if (typeof child === "function") {
    return renderChild(destination, child());
  }
  if (!child && child !== 0) {
    return;
  }
  if (typeof child === "string") {
    destination.write(markHTMLString(escapeHTML(child)));
    return;
  }
  if (isRenderInstance(child)) {
    return child.render(destination);
  }
  if (isRenderTemplateResult(child)) {
    return child.render(destination);
  }
  if (isAstroComponentInstance(child)) {
    return child.render(destination);
  }
  if (ArrayBuffer.isView(child)) {
    destination.write(child);
    return;
  }
  if (typeof child === "object" && (Symbol.asyncIterator in child || Symbol.iterator in child)) {
    if (Symbol.asyncIterator in child) {
      return renderAsyncIterable(destination, child);
    }
    return renderIterable(destination, child);
  }
  destination.write(child);
}
function renderArray(destination, children) {
  const flushers = children.map((c) => {
    return createBufferedRenderer(destination, (bufferDestination) => {
      return renderChild(bufferDestination, c);
    });
  });
  const iterator = flushers[Symbol.iterator]();
  const iterate = () => {
    for (; ; ) {
      const { value: flusher, done } = iterator.next();
      if (done) {
        break;
      }
      const result = flusher.flush();
      if (isPromise(result)) {
        return result.then(iterate);
      }
    }
  };
  return iterate();
}
function renderIterable(destination, children) {
  const iterator = children[Symbol.iterator]();
  const iterate = () => {
    for (; ; ) {
      const { value, done } = iterator.next();
      if (done) {
        break;
      }
      const result = renderChild(destination, value);
      if (isPromise(result)) {
        return result.then(iterate);
      }
    }
  };
  return iterate();
}
async function renderAsyncIterable(destination, children) {
  try {
    for (var iter = __forAwait(children), more, temp, error; more = !(temp = await iter.next()).done; more = false) {
      const value = temp.value;
      await renderChild(destination, value);
    }
  } catch (temp) {
    error = [temp];
  } finally {
    try {
      more && (temp = iter.return) && await temp.call(iter);
    } finally {
      if (error)
        throw error[0];
    }
  }
}
const astroComponentInstanceSym = Symbol.for("astro.componentInstance");
_f = astroComponentInstanceSym;
class AstroComponentInstance {
  constructor(result, props, slots, factory) {
    __publicField(this, _f, true);
    __publicField(this, "result");
    __publicField(this, "props");
    __publicField(this, "slotValues");
    __publicField(this, "factory");
    __publicField(this, "returnValue");
    this.result = result;
    this.props = props;
    this.factory = factory;
    this.slotValues = {};
    for (const name in slots) {
      let didRender = false;
      let value = slots[name](result);
      this.slotValues[name] = () => {
        if (!didRender) {
          didRender = true;
          return value;
        }
        return slots[name](result);
      };
    }
  }
  init(result) {
    if (this.returnValue !== void 0) {
      return this.returnValue;
    }
    this.returnValue = this.factory(result, this.props, this.slotValues);
    if (isPromise(this.returnValue)) {
      this.returnValue.then((resolved) => {
        this.returnValue = resolved;
      }).catch(() => {
      });
    }
    return this.returnValue;
  }
  render(destination) {
    const returnValue = this.init(this.result);
    if (isPromise(returnValue)) {
      return returnValue.then((x) => this.renderImpl(destination, x));
    }
    return this.renderImpl(destination, returnValue);
  }
  renderImpl(destination, returnValue) {
    if (isHeadAndContent(returnValue)) {
      return returnValue.content.render(destination);
    } else {
      return renderChild(destination, returnValue);
    }
  }
}
function validateComponentProps(props, clientDirectives, displayName) {
  if (props != null) {
    const directives = [...clientDirectives.keys()].map((directive) => `client:${directive}`);
    for (const prop of Object.keys(props)) {
      if (directives.includes(prop)) {
        console.warn(
          `You are attempting to render <${displayName} ${prop} />, but ${displayName} is an Astro component. Astro components do not render in the client and should not have a hydration directive. Please use a framework component for client rendering.`
        );
      }
    }
  }
}
function createAstroComponentInstance(result, displayName, factory, props, slots = {}) {
  validateComponentProps(props, result.clientDirectives, displayName);
  const instance = new AstroComponentInstance(result, props, slots, factory);
  if (isAPropagatingComponent(result, factory)) {
    result._metadata.propagators.add(instance);
  }
  return instance;
}
function isAstroComponentInstance(obj) {
  return typeof obj === "object" && obj !== null && !!obj[astroComponentInstanceSym];
}
function componentIsHTMLElement(Component2) {
  return typeof HTMLElement !== "undefined" && HTMLElement.isPrototypeOf(Component2);
}
async function renderHTMLElement(result, constructor, props, slots) {
  const name = getHTMLElementName(constructor);
  let attrHTML = "";
  for (const attr in props) {
    attrHTML += ` ${attr}="${toAttributeString(await props[attr])}"`;
  }
  return markHTMLString(
    `<${name}${attrHTML}>${await renderSlotToString(result, slots == null ? void 0 : slots.default)}</${name}>`
  );
}
function getHTMLElementName(constructor) {
  const definedName = customElements.getName(constructor);
  if (definedName) return definedName;
  const assignedName = constructor.name.replace(/^HTML|Element$/g, "").replace(/[A-Z]/g, "-$&").toLowerCase().replace(/^-/, "html-");
  return assignedName;
}
const rendererAliases = /* @__PURE__ */ new Map([["solid", "solid-js"]]);
const clientOnlyValues = /* @__PURE__ */ new Set(["solid-js", "react", "preact", "vue", "svelte"]);
function guessRenderers(componentUrl) {
  const extname = componentUrl == null ? void 0 : componentUrl.split(".").pop();
  switch (extname) {
    case "svelte":
      return ["@astrojs/svelte"];
    case "vue":
      return ["@astrojs/vue"];
    case "jsx":
    case "tsx":
      return ["@astrojs/react", "@astrojs/preact", "@astrojs/solid-js", "@astrojs/vue (jsx)"];
    case void 0:
    default:
      return [
        "@astrojs/react",
        "@astrojs/preact",
        "@astrojs/solid-js",
        "@astrojs/vue",
        "@astrojs/svelte"
      ];
  }
}
function isFragmentComponent(Component2) {
  return Component2 === Fragment;
}
function isHTMLComponent(Component2) {
  return Component2 && Component2["astro:html"] === true;
}
const ASTRO_SLOT_EXP = /<\/?astro-slot\b[^>]*>/g;
const ASTRO_STATIC_SLOT_EXP = /<\/?astro-static-slot\b[^>]*>/g;
function removeStaticAstroSlot(html, supportsAstroStaticSlot = true) {
  const exp = supportsAstroStaticSlot ? ASTRO_STATIC_SLOT_EXP : ASTRO_SLOT_EXP;
  return html.replace(exp, "");
}
async function renderFrameworkComponent(result, displayName, Component2, _props, slots = {}) {
  var _a2, _b, _c2, _d2;
  if (!Component2 && "client:only" in _props === false) {
    throw new Error(
      `Unable to render ${displayName} because it is ${Component2}!
Did you forget to import the component or is it possible there is a typo?`
    );
  }
  const { renderers: renderers2, clientDirectives } = result;
  const metadata = {
    astroStaticSlot: true,
    displayName
  };
  const { hydration, isPage, props, propsWithoutTransitionAttributes } = extractDirectives(
    _props,
    clientDirectives
  );
  let html = "";
  let attrs = void 0;
  if (hydration) {
    metadata.hydrate = hydration.directive;
    metadata.hydrateArgs = hydration.value;
    metadata.componentExport = hydration.componentExport;
    metadata.componentUrl = hydration.componentUrl;
  }
  const probableRendererNames = guessRenderers(metadata.componentUrl);
  const validRenderers = renderers2.filter((r) => r.name !== "astro:jsx");
  const { children, slotInstructions } = await renderSlots(result, slots);
  let renderer2;
  if (metadata.hydrate !== "only") {
    let isTagged = false;
    try {
      isTagged = Component2 && Component2[Renderer];
    } catch (e) {
    }
    if (isTagged) {
      const rendererName = Component2[Renderer];
      renderer2 = renderers2.find(({ name }) => name === rendererName);
    }
    if (!renderer2) {
      let error;
      for (const r of renderers2) {
        try {
          if (await r.ssr.check.call({ result }, Component2, props, children)) {
            renderer2 = r;
            break;
          }
        } catch (e) {
          error != null ? error : error = e;
        }
      }
      if (!renderer2 && error) {
        throw error;
      }
    }
    if (!renderer2 && typeof HTMLElement === "function" && componentIsHTMLElement(Component2)) {
      const output = await renderHTMLElement(
        result,
        Component2,
        _props,
        slots
      );
      return {
        render(destination) {
          destination.write(output);
        }
      };
    }
  } else {
    if (metadata.hydrateArgs) {
      const rendererName = rendererAliases.has(metadata.hydrateArgs) ? rendererAliases.get(metadata.hydrateArgs) : metadata.hydrateArgs;
      if (clientOnlyValues.has(rendererName)) {
        renderer2 = renderers2.find(
          ({ name }) => name === `@astrojs/${rendererName}` || name === rendererName
        );
      }
    }
    if (!renderer2 && validRenderers.length === 1) {
      renderer2 = validRenderers[0];
    }
    if (!renderer2) {
      const extname = (_a2 = metadata.componentUrl) == null ? void 0 : _a2.split(".").pop();
      renderer2 = renderers2.find(({ name }) => name === `@astrojs/${extname}` || name === extname);
    }
  }
  let componentServerRenderEndTime;
  if (!renderer2) {
    if (metadata.hydrate === "only") {
      const rendererName = rendererAliases.has(metadata.hydrateArgs) ? rendererAliases.get(metadata.hydrateArgs) : metadata.hydrateArgs;
      if (clientOnlyValues.has(rendererName)) {
        const plural = validRenderers.length > 1;
        throw new AstroError(__spreadProps(__spreadValues({}, NoMatchingRenderer), {
          message: NoMatchingRenderer.message(
            metadata.displayName,
            (_b = metadata == null ? void 0 : metadata.componentUrl) == null ? void 0 : _b.split(".").pop(),
            plural,
            validRenderers.length
          ),
          hint: NoMatchingRenderer.hint(
            formatList(probableRendererNames.map((r) => "`" + r + "`"))
          )
        }));
      } else {
        throw new AstroError(__spreadProps(__spreadValues({}, NoClientOnlyHint), {
          message: NoClientOnlyHint.message(metadata.displayName),
          hint: NoClientOnlyHint.hint(
            probableRendererNames.map((r) => r.replace("@astrojs/", "")).join("|")
          )
        }));
      }
    } else if (typeof Component2 !== "string") {
      const matchingRenderers = validRenderers.filter(
        (r) => probableRendererNames.includes(r.name)
      );
      const plural = validRenderers.length > 1;
      if (matchingRenderers.length === 0) {
        throw new AstroError(__spreadProps(__spreadValues({}, NoMatchingRenderer), {
          message: NoMatchingRenderer.message(
            metadata.displayName,
            (_c2 = metadata == null ? void 0 : metadata.componentUrl) == null ? void 0 : _c2.split(".").pop(),
            plural,
            validRenderers.length
          ),
          hint: NoMatchingRenderer.hint(
            formatList(probableRendererNames.map((r) => "`" + r + "`"))
          )
        }));
      } else if (matchingRenderers.length === 1) {
        renderer2 = matchingRenderers[0];
        ({ html, attrs } = await renderer2.ssr.renderToStaticMarkup.call(
          { result },
          Component2,
          propsWithoutTransitionAttributes,
          children,
          metadata
        ));
      } else {
        throw new Error(`Unable to render ${metadata.displayName}!

This component likely uses ${formatList(probableRendererNames)},
but Astro encountered an error during server-side rendering.

Please ensure that ${metadata.displayName}:
1. Does not unconditionally access browser-specific globals like \`window\` or \`document\`.
   If this is unavoidable, use the \`client:only\` hydration directive.
2. Does not conditionally return \`null\` or \`undefined\` when rendered on the server.

If you're still stuck, please open an issue on GitHub or join us at https://astro.build/chat.`);
      }
    }
  } else {
    if (metadata.hydrate === "only") {
      html = await renderSlotToString(result, slots == null ? void 0 : slots.fallback);
    } else {
      const componentRenderStartTime = performance.now();
      ({ html, attrs } = await renderer2.ssr.renderToStaticMarkup.call(
        { result },
        Component2,
        propsWithoutTransitionAttributes,
        children,
        metadata
      ));
      if (process.env.NODE_ENV === "development")
        componentServerRenderEndTime = performance.now() - componentRenderStartTime;
    }
  }
  if (!html && typeof Component2 === "string") {
    const Tag = sanitizeElementName(Component2);
    const childSlots = Object.values(children).join("");
    const renderTemplateResult = renderTemplate`<${Tag}${internalSpreadAttributes(
      props,
      true,
      Tag
    )}${markHTMLString(
      childSlots === "" && voidElementNames.test(Tag) ? `/>` : `>${childSlots}</${Tag}>`
    )}`;
    html = "";
    const destination = {
      write(chunk) {
        if (chunk instanceof Response) return;
        html += chunkToString(result, chunk);
      }
    };
    await renderTemplateResult.render(destination);
  }
  if (!hydration) {
    return {
      render(destination) {
        var _a3;
        if (slotInstructions) {
          for (const instruction of slotInstructions) {
            destination.write(instruction);
          }
        }
        if (isPage || (renderer2 == null ? void 0 : renderer2.name) === "astro:jsx") {
          destination.write(html);
        } else if (html && html.length > 0) {
          destination.write(
            markHTMLString(removeStaticAstroSlot(html, (_a3 = renderer2 == null ? void 0 : renderer2.ssr) == null ? void 0 : _a3.supportsAstroStaticSlot))
          );
        }
      }
    };
  }
  const astroId = shorthash(
    `<!--${metadata.componentExport.value}:${metadata.componentUrl}-->
${html}
${serializeProps(
      props,
      metadata
    )}`
  );
  const island = await generateHydrateScript(
    { renderer: renderer2, result, astroId, props, attrs },
    metadata
  );
  if (componentServerRenderEndTime && process.env.NODE_ENV === "development")
    island.props["server-render-time"] = componentServerRenderEndTime;
  let unrenderedSlots = [];
  if (html) {
    if (Object.keys(children).length > 0) {
      for (const key of Object.keys(children)) {
        let tagName = ((_d2 = renderer2 == null ? void 0 : renderer2.ssr) == null ? void 0 : _d2.supportsAstroStaticSlot) ? !!metadata.hydrate ? "astro-slot" : "astro-static-slot" : "astro-slot";
        let expectedHTML = key === "default" ? `<${tagName}>` : `<${tagName} name="${key}">`;
        if (!html.includes(expectedHTML)) {
          unrenderedSlots.push(key);
        }
      }
    }
  } else {
    unrenderedSlots = Object.keys(children);
  }
  const template = unrenderedSlots.length > 0 ? unrenderedSlots.map(
    (key) => `<template data-astro-template${key !== "default" ? `="${key}"` : ""}>${children[key]}</template>`
  ).join("") : "";
  island.children = `${html != null ? html : ""}${template}`;
  if (island.children) {
    island.props["await-children"] = "";
    island.children += `<!--astro:end-->`;
  }
  return {
    render(destination) {
      if (slotInstructions) {
        for (const instruction of slotInstructions) {
          destination.write(instruction);
        }
      }
      destination.write(createRenderInstruction({ type: "directive", hydration }));
      if (hydration.directive !== "only" && (renderer2 == null ? void 0 : renderer2.ssr.renderHydrationScript)) {
        destination.write(
          createRenderInstruction({
            type: "renderer-hydration-script",
            rendererName: renderer2.name,
            render: renderer2.ssr.renderHydrationScript
          })
        );
      }
      const renderedElement = renderElement("astro-island", island, false);
      destination.write(markHTMLString(renderedElement));
    }
  };
}
function sanitizeElementName(tag) {
  const unsafe = /[&<>'"\s]+/;
  if (!unsafe.test(tag)) return tag;
  return tag.trim().split(unsafe)[0].trim();
}
async function renderFragmentComponent(result, slots = {}) {
  const children = await renderSlotToString(result, slots == null ? void 0 : slots.default);
  return {
    render(destination) {
      if (children == null) return;
      destination.write(children);
    }
  };
}
async function renderHTMLComponent(result, Component2, _props, slots = {}) {
  const { slotInstructions, children } = await renderSlots(result, slots);
  const html = Component2({ slots: children });
  const hydrationHtml = slotInstructions ? slotInstructions.map((instr) => chunkToString(result, instr)).join("") : "";
  return {
    render(destination) {
      destination.write(markHTMLString(hydrationHtml + html));
    }
  };
}
function renderAstroComponent(result, displayName, Component2, props, slots = {}) {
  if (containsServerDirective(props)) {
    const serverIslandComponent = new ServerIslandComponent(result, props, slots, displayName);
    result._metadata.propagators.add(serverIslandComponent);
    return serverIslandComponent;
  }
  const instance = createAstroComponentInstance(result, displayName, Component2, props, slots);
  return {
    render(destination) {
      return instance.render(destination);
    }
  };
}
function renderComponent(result, displayName, Component2, props, slots = {}) {
  if (isPromise(Component2)) {
    return Component2.catch(handleCancellation).then((x) => {
      return renderComponent(result, displayName, x, props, slots);
    });
  }
  if (isFragmentComponent(Component2)) {
    return renderFragmentComponent(result, slots).catch(handleCancellation);
  }
  props = normalizeProps(props);
  if (isHTMLComponent(Component2)) {
    return renderHTMLComponent(result, Component2, props, slots).catch(handleCancellation);
  }
  if (isAstroComponentFactory(Component2)) {
    return renderAstroComponent(result, displayName, Component2, props, slots);
  }
  return renderFrameworkComponent(result, displayName, Component2, props, slots).catch(
    handleCancellation
  );
  function handleCancellation(e) {
    if (result.cancelled)
      return {
        render() {
        }
      };
    throw e;
  }
}
function normalizeProps(props) {
  if (props["class:list"] !== void 0) {
    const value = props["class:list"];
    delete props["class:list"];
    props["class"] = clsx(props["class"], value);
    if (props["class"] === "") {
      delete props["class"];
    }
  }
  return props;
}
async function renderScript(result, id) {
  const inlined = result.inlinedScripts.get(id);
  let content = "";
  if (inlined != null) {
    if (inlined) {
      content = `<script type="module">${inlined}<\/script>`;
    }
  } else {
    const resolved = await result.resolve(id);
    content = `<script type="module" src="${result.userAssetsBase ? (result.base === "/" ? "" : result.base) + result.userAssetsBase : ""}${resolved}"><\/script>`;
  }
  return createRenderInstruction({ type: "script", id, content });
}
"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_".split("").reduce((v, c) => (v[c.charCodeAt(0)] = c, v), []);
"-0123456789_".split("").reduce((v, c) => (v[c.charCodeAt(0)] = c, v), []);
const DEFAULT_LANGUAGE = "fr";
const AVAILABLE_LANGUAGES = ["fr", "en"];
const common$1 = { "next": "Suivant", "previous": "Précédent", "save": "Enregistrer", "cancel": "Annuler", "close": "Fermer", "loading": "Chargement...", "error": "Erreur", "success": "Succès", "confirm": "Confirmer", "delete": "Supprimer", "edit": "Modifier", "search": "Rechercher", "logout": "Déconnexion", "login": "Connexion", "register": "S'inscrire", "yes": "Oui", "no": "Non", "or": "ou", "and": "et", "optional": "optionnel", "required": "requis", "add": "Ajouter", "apply": "Appliquer", "retry": "Réessayer", "back": "Retour", "configure": "Configurer", "test": "Tester", "open": "Ouvrir", "pause": "Pause", "resume": "Reprendre", "all": "Tout", "film": "Film", "serie": "Série", "content": "Contenu", "download": "Télécharger", "watch": "Regarder", "torrents": "Torrents", "details": "Détails", "other": "Autre", "others": "Autres", "verification": "Vérification...", "noData": "Aucune donnée disponible", "unknownError": "Erreur inconnue" };
const demo$1 = { "entryLoading": "Ouverture de la démo...", "exitDemo": "Quitter le mode démo", "modeActive": "Mode démo actif", "badge": "Démo", "modeActiveDescription": "Les données et actions sont simulées. Pour utiliser votre compte et votre backend, quittez le mode démo." };
const ads$1 = { "adLabel": "Publicité", "skip": "Passer", "skipIn": "Passer dans {seconds}s", "start": "Démarrer la pub", "unavailable": "Publicité indisponible", "trailerWatchOnYoutube": "Voir la bande-annonce sur YouTube", "trailerEmbedUnsupported": "La lecture intégrée n'est pas disponible sur cet appareil (ex. TV).", "trailerPlay": "Lire la bande-annonce" };
const requests$1 = { "myRequests": "Mes demandes", "myRequestsExplanation": "Cette page liste tous les médias que vous avez demandés (films, séries). Chaque demande passe par un processus de validation : en attente, approuvé ou refusé. Lorsqu'une demande est approuvée, le média est téléchargé automatiquement.", "noRequests": "Vous n'avez encore demandé aucun contenu.", "discoverContent": "Découvrir du contenu", "statusPending": "En attente", "statusApproved": "Approuvé", "statusDeclined": "Refusé", "statusUnknown": "Inconnu", "errorLoad": "Impossible de charger les demandes", "requestMedia": "Demander", "requestSubmitted": "Demande effectuée", "cancelRequest": "Annuler la demande", "requestCancelled": "Demande annulée", "requestSuccess": "Demande envoyée avec succès", "requestAlreadyExists": "Une demande existe déjà pour ce média", "quotaExceeded": "Quota de demandes dépassé", "requestedOn": "Demandé le", "confirmDelete": "Êtes-vous sûr de vouloir annuler cette demande ?" };
const requestsAdmin$1 = { "title": "Gestion des demandes", "description": "Approuver ou refuser les demandes de médias. Les demandes approuvées déclenchent un téléchargement automatique.", "explanation": "Lorsque les utilisateurs demandent des films ou séries (via le bouton « Demander » sur une page média), leurs demandes apparaissent ici. En tant qu'administrateur, vous pouvez approuver ou refuser chaque demande. Les demandes approuvées déclenchent un téléchargement automatique du média sélectionné.", "approve": "Approuver", "decline": "Refuser", "notes": "Notes", "noPendingRequests": "Aucune demande en attente" };
const feedback$1 = { "requireCloud": "Connectez-vous avec un compte cloud pour envoyer un feedback.", "conversations": "Conversations", "noThreads": "Aucune conversation", "admin": "Équipe", "you": "Vous", "newThread": "Nouvelle conversation", "newMessage": "Nouveau message", "newMessageDesc": "Envoyez un message à l'équipe pour signaler un problème ou une suggestion.", "subjectPlaceholder": "Sujet", "contentPlaceholder": "Votre message...", "replyPlaceholder": "Votre réponse...", "send": "Envoyer", "newReply": "Nouvelle réponse", "newReplyBody": "Vous avez reçu une nouvelle réponse à votre feedback", "unread": "non lu(s)" };
const backend$1 = { "badgeTitleOk": "Serveur backend démarré", "badgeTitleError": "Serveur backend arrêté ou erreur", "badgeTitleChecking": "Vérification du serveur...", "statusOk": "Serveur", "statusError": "Hors ligne", "statusChecking": "…", "menuTitle": "Serveur local", "versionLabel": "Version", "startServer": "Démarrer le serveur", "stopServer": "Arrêter le serveur", "restartServer": "Redémarrer le serveur" };
const blacklist$1 = { "title": "Liste noire", "description": "Exclure des médias de la découverte", "explanation": "La liste noire permet d'exclure certains films ou séries de la découverte et des demandes. Les médias blacklistés n'apparaîtront pas dans les carrousels de la page d'accueil et les utilisateurs ne pourront pas les demander.", "noItems": "Aucun média blacklisté", "addToBlacklist": "Ajouter à la liste noire", "removeFromBlacklist": "Retirer de la liste noire" };
const discover$1 = { "sliders": "Sliders de découverte", "slidersExplanation": "Les sliders sont les carrousels thématiques affichés sur la page d'accueil (ex : « Tendances films », « Séries populaires »). Ils permettent de personnaliser le contenu proposé aux utilisateurs. Initialisez les sliders par défaut pour commencer, puis activez ou désactivez-les selon vos besoins.", "configureSliders": "Configurer les sliders", "discoverMovies": "Découverte films", "discoverSeries": "Découverte séries", "initializeDefaults": "Initialiser les sliders par défaut", "enabled": "Activé", "disabled": "Désactivé", "noSliders": "Aucun slider configuré", "noTorrentsYet": "Aucun torrent n'a encore été trouvé pour ce média. Utilisez le bouton Demander pour demander à un administrateur de l'ajouter. Une fois approuvé, le téléchargement démarrera automatiquement.", "requestThisMedia": "Demander ce média", "requestSubmitted": "Votre demande a été enregistrée.", "requestAlreadySubmitted": "Vous avez déjà demandé ce média.", "releaseDateExpected": "Sortie prévue le {date}", "releasedOn": "Sorti le {date}", "missingParams": "Paramètres manquants (tmdbId, type)", "description": "Personnaliser les carrousels de la page d'accueil (tendances films, séries populaires, etc.)", "popularMovies": "Films populaires", "popularSeries": "Séries populaires", "topRatedMovies": "Films les mieux notés", "topRatedSeries": "Séries les mieux notées", "cinemaReleases": "Sorties cinéma", "vodReleases": "Sorties VOD", "newReleases": "Nouveautés", "pageSubtitle": "Découvrez des films et séries à demander" };
const languages$1 = { "fr": "Français", "en": "English" };
const wizard$1 = /* @__PURE__ */ JSON.parse(`{"language":{"title":"Choisissez votre langue","description":"Sélectionnez la langue de l'interface. Vous pourrez la modifier à tout moment dans les paramètres.","selectLanguage":"Langue de l'interface"},"serverUrl":{"title":"Configuration du serveur","description":"Entrez l'URL de votre serveur Popcornn backend","placeholder":"https://votre-serveur.com","testConnection":"Tester la connexion","connectionSuccess":"Connexion réussie !","connectionError":"Impossible de se connecter au serveur","step1FirstTimeTitle":"Configuration initiale","step1FirstTimeSubtitle":"Connectez ce client à votre serveur : scannez le QR code depuis votre téléphone (ou un autre appareil déjà configuré), ou entrez l’URL du serveur ici.","step1ReconfigureTitle":"Modifier la configuration","step1ReconfigureSubtitle":"Changez l’URL du serveur ou ajoutez cet appareil via le QR code.","connectClientTitle":"Connecter ce client","webosLocalHint":"Sur TV (webOS), connectez-vous à votre serveur Popcorn sur le réseau local : choisissez « Compte local » puis entrez l’adresse de l’ordinateur où tourne le serveur (ex. http://192.168.1.100:3000). TV et serveur doivent être sur le même Wi‑Fi.","choiceQuestion":"Comment souhaitez-vous procéder ?","choiceFirstTime":"C'est ma première installation","choiceFirstTimeDesc":"Je n'ai jamais configuré Popcornn. Je veux entrer l'URL du serveur ici ou faire la configuration depuis mon téléphone.","choiceAlreadyConfigured":"J'ai déjà configuré Popcornn","choiceAlreadyConfiguredDesc":"Un autre appareil (téléphone, TV, ordinateur) est déjà connecté. Je veux scanner son QR code ou entrer le code pour récupérer la configuration.","choiceLocalAccount":"Compte local","choiceLocalAccountDesc":"J'ai reçu une invitation (compte local). L'URL du serveur est déjà fournie ou je vais la saisir — pas besoin de scanner un QR code ni de saisir un code sur popcorn-web.","backToQrOrCode":"Retour au QR code ou au code","mobileWelcome":"Bienvenue !","mobileChoiceIntro":"Choisissez comment connecter cet appareil :","mobileJoinExisting":"J’ai déjà un compte et un serveur","mobileJoinExistingDesc":"Scannez le QR code affiché sur une TV ou un ordinateur déjà configuré pour récupérer l’URL du serveur et vous connecter.","mobileFirstInstall":"Première installation sur cet appareil","mobileFirstInstallDesc":"Entrez l’URL de votre serveur manuellement, puis poursuivez la configuration sur cet appareil.","scanQRCode":"Scanner le QR code","scanQRCodeDesc":"Autorisez l'accès à la caméra pour scanner le QR code affiché sur votre TV ou ordinateur","enterCodeManually":"Entrer le code manuellement","enterCodeDesc":"Si vous ne pouvez pas scanner, entrez le code à 6 caractères affiché sur l'autre appareil","manualConfig":"Configuration manuelle","manualConfigDesc":"Entrer l'URL du serveur manuellement (première installation)","cameraPermissionError":"Accès à la caméra refusé","cameraPermissionHelp":"Pour scanner le QR code, vous devez autoriser l'accès à la caméra. Allez dans les paramètres de l'application et activez la permission caméra.","qrScanError":"Impossible de scanner le QR code","qrScanErrorHelp":"Vérifiez que le QR code est bien visible et que la caméra fonctionne correctement. Vous pouvez aussi entrer le code manuellement ci-dessous.","tvInstructionsTitle":"Connectez avec votre téléphone","tvStep1":"Sur votre téléphone, ouvrez l’app Popcornn ou le site popcorn-web (déjà connecté à votre compte).","tvStep2":"Scannez ce QR code ou ouvrez le lien affiché.","tvStep3":"Sur la page qui s’ouvre : connectez-vous si besoin, configurez l’URL du serveur si ce n’est pas encore fait, puis cliquez sur « Autoriser ».","tvStep4":"Allez sur popcorn-web et saisissez ce code pour autoriser cet appareil.","tvQrAlsoSetupFromPhone":"Vous pouvez faire toute la première configuration depuis votre téléphone : ouvrez le lien (QR ou code), connectez-vous à votre compte, renseignez l’URL du serveur si besoin, puis autorisez ce code.","tvWaitingAuth":"En attente d'autorisation depuis votre téléphone...","tvAuthorized":"Autorisé ! Connexion en cours...","tvExpiresIn":"Expire dans","tvSeconds":"secondes","tvOrEnterCode":"Code à saisir sur popcorn-web (même que dans le QR)","openPopcornWebToAuthorize":"Ouvrir popcorn-web pour autoriser (code déjà inclus)","errors":{"backendRequired":"Veuillez entrer une URL de serveur","invalidUrl":"L'URL n'est pas valide","invalidUrlFormat":"Format d'URL invalide. Utilisez : http://192.168.1.100:3000 ou https://votre-domaine.com","invalidProtocol":"Le protocole doit être http:// ou https://","connectionFailed":"Impossible de se connecter au serveur","connectionFailedDetails":"Vérifiez que :\\n• Le serveur Popcornn est démarré\\n• L'adresse IP est correcte\\n• Votre appareil et le serveur sont sur le même réseau Wi-Fi","backendNotAccessible":"Le serveur n'est pas accessible","backendNotAccessibleDetails":"Vérifiez que le serveur Popcornn est démarré et que l'URL est correcte","saveError":"Erreur lors de la sauvegarde de la configuration","quickConnectInitError":"Impossible de démarrer la connexion rapide","quickConnectInitErrorDetails":"Vérifiez votre connexion internet et réessayez","codeExpired":"Le code de connexion a expiré","codeExpiredDetails":"Les codes de connexion expirent après quelques minutes. Générez un nouveau code.","codeInvalid":"Code invalide ou expiré","codeInvalidDetails":"Vérifiez que vous avez scanné le bon QR code ou entré le bon code à 6 caractères","codeWrongLength":"Le code doit contenir exactement 6 caractères","connectionError":"Erreur lors de la connexion","connectionErrorDetails":"Une erreur s'est produite lors de la connexion. Vérifiez votre connexion internet et réessayez","noBackendUrlInCloud":"Aucune URL de serveur configurée","noBackendUrlInCloudDetails":"Votre compte cloud ne contient pas d'URL de serveur. Utilisez la configuration manuelle pour entrer l'URL de votre serveur.","secretNotReceived":"Erreur technique : informations de connexion manquantes","authorizationError":"Erreur lors de l'autorisation","authorizationErrorDetails":"Une erreur s'est produite lors de l'autorisation. Réessayez ou utilisez la configuration manuelle","qrCodeInvalid":"QR code invalide","qrCodeInvalidDetails":"Le QR code scanné n'est pas valide. Assurez-vous de scanner le QR code affiché sur votre TV ou ordinateur.","networkError":"Erreur de connexion réseau","networkErrorDetails":"Impossible de contacter le serveur. Vérifiez votre connexion internet et que le serveur est accessible."}},"disclaimer":{"title":"Avertissement","description":"Veuillez lire et accepter les conditions suivantes avant de continuer","acceptTerms":"J'accepte les conditions d'utilisation","content":"Cette application est destinée à un usage personnel uniquement. L'utilisateur est responsable de s'assurer que son utilisation est conforme aux lois en vigueur dans son pays."},"auth":{"title":"Connexion / Inscription","description":"Connectez-vous avec votre compte Popcornn.app","usePopcornAccount":"","loginTab":"Connexion","registerTab":"Inscription","email":"Email","password":"Mot de passe","confirmPassword":"Confirmer le mot de passe","forgotPassword":"Mot de passe oublié ?","loginButton":"Se connecter","registerButton":"S'inscrire","orContinueWith":"Ou continuer avec","quickConnect":"Connexion rapide","cloudLogin":"Connexion cloud","noAccount":"Pas encore de compte ?","hasAccount":"Déjà un compte ?"},"welcome":{"title":"Bienvenue !","description":"Configuration initiale de votre application","cloudBackup":"Sauvegarder ma configuration dans le cloud","cloudBackupDescription":"Vos paramètres seront synchronisés et restaurés automatiquement sur tous vos appareils","importConfig":"Importer la configuration cloud","importConfigDescription":"Restaurer votre configuration depuis le cloud","skipImport":"Configurer manuellement","importTitle":"Import de votre configuration cloud","importExplanation":"Tout ce qui est sauvegardé dans votre compte cloud est importé : indexers, clé TMDB, emplacement de téléchargement, paramètres de synchronisation, langue. Seuls les éléments présents dans le cloud sont listés ci-dessous.","importedConfigTitle":"Configuration importée — vous pouvez modifier les éléments ci-dessous :","importOnlyIndexersHint":"Seuls les indexers étaient présents dans le cloud. Pour importer aussi la clé TMDB, l'emplacement et les paramètres de sync, cochez « Synchroniser la configuration dans le cloud » à la fin du wizard sur un appareil déjà configuré.","importBadgeImported":"Importé","importBadgeNothingInCloud":"Rien dans le cloud","importLabelIndexers":"Indexers","importLabelTmdb":"Clé TMDB","importLabelCategories":"Catégories d'indexers","importLabelDownloadLocation":"Emplacement de téléchargement","importLabelSyncSettings":"Paramètres de synchronisation","importLabelLanguage":"Langue","modify":"Modifier"},"indexers":{"title":"Configuration des indexers","description":"Ajoutez vos indexers pour rechercher du contenu","addIndexer":"Ajouter un indexer","noIndexers":"Aucun indexer configuré","testIndexer":"Tester","deleteIndexer":"Supprimer","indexerName":"Nom de l'indexer","indexerUrl":"URL de l'indexer","apiKey":"Clé API"},"tmdb":{"title":"Configuration TMDB","description":"Configurez votre clé API TMDB pour enrichir les métadonnées","apiKeyLabel":"Clé API TMDB","apiKeyPlaceholder":"Entrez votre clé API TMDB","testKey":"Tester la clé","getKey":"Obtenir une clé API","keyValid":"Clé API valide","keyInvalid":"Clé API invalide"},"downloadLocation":{"title":"Emplacement des téléchargements","description":"Choisissez où enregistrer vos fichiers téléchargés","selectFolder":"Sélectionner un dossier","currentPath":"Chemin actuel","defaultPath":"Utiliser le chemin par défaut","stepTitle":"Chemin de téléchargement","stepIntro":"Indiquez le dossier où le backend enregistre les torrents. Ce chemin dépend de la façon dont vous exécutez le serveur :","contextDevLabel":"Dev (local)","contextDockerLabel":"Docker","contextWindowsDaemonLabel":"Démon Windows","contextDev":"En développement (backend local) : chemin relatif au répertoire de travail du backend (ex. downloads ou ./downloads) ou chemin absolu (ex. C:\\\\Users\\\\...\\\\Downloads).","contextDocker":"Docker : le chemin est à l’intérieur du conteneur (ex. /app/downloads). Configurez le volume dans docker-compose (ex. ./data/downloads:/app/downloads) pour accéder aux fichiers sur l’hôte.","contextWindowsDaemon":"Démon Windows (service) : chemin sur la machine où le backend tourne (ex. C:\\\\Popcorn\\\\downloads). Définissez DOWNLOAD_DIR ou le fichier config du service pour que le backend utilise ce dossier.","pathLabel":"Chemin utilisé par le backend","pathPlaceholder":"Ex. downloads, /app/downloads ou C:\\\\Popcorn\\\\downloads","pathSavedHint":"Chemin enregistré. Le backend utilisera ce dossier pour les téléchargements.","realPathLabel":"Chemin réel utilisé par le backend","errorRequired":"Veuillez entrer un chemin de téléchargement","loading":"Récupération du chemin…","previous":"Précédent","next":"Suivant"},"sync":{"title":"Synchronisation","description":"Configurez la synchronisation automatique du contenu","enableSync":"Activer la synchronisation automatique","syncFrequency":"Fréquence de synchronisation","minutes":"minutes","maxTorrents":"Nombre maximum de torrents par catégorie","rssIncremental":"Synchronisation incrémentale RSS","filmQueries":"Requêtes de recherche films","seriesQueries":"Requêtes de recherche séries"},"complete":{"title":"Configuration terminée !","description":"Votre application est prête à être utilisée","startUsing":"Commencer à utiliser l'application","savingConfig":"Sauvegarde de la configuration...","configSaved":"Configuration sauvegardée avec succès","startSync":"Démarrer la synchronisation initiale"}}`);
const account$1 = { "title": "Mon compte", "defaultName": "Utilisateur", "profile": "Profil", "displayName": "Nom d'affichage", "displayNamePlaceholder": "Votre nom d'affichage", "displayNameOptionalHint": "Optionnel. Sinon, l'email est utilisé.", "avatar": "Avatar", "avatarTvHint": "TV : privilégiez une image carrée (≥ 256×256).", "invalidImage": "Veuillez sélectionner une image (PNG, JPG ou WebP).", "avatarUrl": "URL de l'avatar", "avatarUrlPlaceholder": "https://exemple.com/avatar.jpg", "uploadAvatar": "Importer une image", "removeAvatar": "Supprimer l'avatar", "email": "Email", "userId": "ID utilisateur", "language": "Langue", "languageDescription": "Langue de l'interface utilisateur", "interfaceSettings": "Langue et affichage", "interfaceSettingsDescription": "Personnalisez la langue, le thème et les préférences d'affichage dans la section Interface des paramètres.", "openInterfaceSettings": "Ouvrir les paramètres d'interface", "noUserInfo": "Aucune information utilisateur disponible", "logout": "Se déconnecter", "logoutConfirm": "Êtes-vous sûr de vouloir vous déconnecter ?", "twoFactor": { "title": "Authentification à deux facteurs", "descriptionShort": "Ajoutez une couche de sécurité en recevant un code par email à chaque connexion.", "configure": "Configurer la 2FA", "enabled": "Activée", "disabled": "Désactivée", "enable": "Activer la 2FA", "disable": "Désactiver la 2FA", "sendCode": "Envoyer le code", "enterCode": "Entrez le code reçu par email", "verifyCode": "Vérifier le code" }, "quickConnect": { "title": "Connexion rapide", "description": "Scannez le QR code avec votre téléphone (popcorn-web), connectez-vous puis autorisez cet appareil. Vous pouvez aussi entrer le code manuellement.", "enterCode": "Entrez le code de connexion rapide", "authorize": "Autoriser", "scanHint": "Scannez pour ouvrir popcorn-web : connectez-vous puis autorisez cet appareil", "codeLabel": "Code de connexion", "expiresIn": "Expire dans", "waitingAuth": "En attente d'autorisation...", "authorized": "Autorisé ! Connexion en cours...", "connectedSuccess": "Connecté avec succès !", "generateNewCode": "Générer un nouveau code", "regenerateCode": "Régénérer le code", "initError": "Erreur lors de l'initialisation de la connexion rapide", "connectError": "Erreur lors de la connexion", "codeExpired": "Le code a expiré. Cliquez pour générer un nouveau code.", "qrAlt": "QR Code de connexion rapide" }, "subMenu": { "accountInfo": "Informations du compte", "accountInfoDesc": "Email, ID utilisateur", "logoutDesc": "Se déconnecter de ce compte" }, "quickLinks": "Liens rapides", "profileCardDescription": "Avatar, informations du compte et déconnexion" };
const interfaceSettings$1 = { "theme": "Thème", "themeDescription": "Choisissez l'apparence de l'interface (clair, sombre ou automatique selon le système)", "themeOptions": { "dark": "Sombre", "light": "Clair", "auto": "Système" }, "autoplay": "Lecture automatique", "autoplayDescription": "Démarrer automatiquement la lecture des épisodes suivants", "skipIntro": "Passer le générique", "skipIntroDescription": "Afficher un bouton pour passer le générique de début pendant les séries", "skipIntroAuto": "Saut automatique du générique", "skipIntroAutoDescription": "Au démarrage d'un épisode, sauter automatiquement le générique de début", "nextEpisodeButton": "Bouton « Épisode suivant »", "nextEpisodeButtonDescription": "Afficher un bouton pour passer à l'épisode suivant peu avant la fin", "introSkipSeconds": "Durée du générique (secondes)", "introSkipSecondsDescription": "Durée du générique en secondes (bouton et saut automatique)", "nextEpisodeCountdownSeconds": "Afficher « Épisode suivant » avant la fin (secondes)", "nextEpisodeCountdownDescription": "Nombre de secondes avant la fin pour afficher le bouton", "streamingMode": "Lecteur par défaut", "streamingModeDescription": "Choisissez le système de lecture : HLS (recommandé), Lucie (WebM) ou flux direct (mode alternatif).", "streamingModeHls": "HLS (adaptatif, recommandé)", "streamingModeHlsDescription": "Streaming adaptatif avec segments .ts (compatible avec tous les médias)", "streamingModeLucie": "Lucie (WebM segments)", "streamingModeLucieDescription": "Segments WebM de 5 secondes avec VP9+Opus (moderne, nécessite support navigateur)", "streamingModeDirect": "Direct (alternative sans HLS)", "streamingModeDirectDescription": "Lecture directe sans transcodage (limité aux formats supportés nativement)", "streamingDownloadFull": "Télécharger le média en entier en mode streaming", "streamingDownloadFullDescription": "C’est l’abonnement actif qui permet d’utiliser le mode streaming. Ce réglage choisit uniquement, lorsque vous lisez en streaming : télécharger tout le fichier en arrière-plan ou seulement la partie lue.", "streamingDownloadFullRequiresSubscription": "Le mode streaming (et cette option) nécessitent un abonnement actif avec l’option streaming torrent.", "streamingRetention": "Rétention des torrents", "streamingRetentionDescription": "Durée de conservation des torrents téléchargés en streaming. Après ce délai, ils sont supprimés automatiquement pour libérer de l'espace.", "streamingRetentionKeep": "Garder indéfiniment", "streamingRetentionDontKeep": "Ne pas garder (supprimer après lecture)", "streamingRetentionDays": "{days} jours", "librarySection": "Affichage de la bibliothèque", "librarySectionDescription": "Personnaliser langue, qualité et pagination des listes de la bibliothèque", "showZeroSeedTorrents": "Afficher les torrents sans seeders", "showZeroSeedTorrentsDescription": "Inclure les torrents avec 0 seeder dans les pages Films et Séries (certains peuvent être indisponibles)", "torrentsInitialLimit": "Éléments chargés au départ", "torrentsInitialLimitDescription": "Nombre de films/séries affichés au premier chargement (20-500)", "torrentsLoadMoreLimit": "Éléments par chargement supplémentaire", "torrentsLoadMoreLimitDescription": "Nombre d'éléments ajoutés à chaque scroll (20-200)", "torrentsRecentLimit": "Section « Ajouts récents »", "torrentsRecentLimitDescription": "Nombre d'éléments dans la section ajouts récents (20-200)" };
const playback$1 = { "nextEpisode": "Épisode suivant", "playLabel": "Lire", "playStreamingLabel": "Lire en streaming (téléchargement en cours)", "downloadFullSeason": "Télécharger toute la saison", "resumeLabel": "Reprendre", "buffering": "Mise en buffer…", "bufferingProgress": "Mise en buffer {percent}%", "loadingVideo": "Chargement de la vidéo…", "preparingStream": "Préparation de la lecture en cours…", "streamPreparingRetry": "Préparation du flux, nouvelle tentative…", "streamingFallbackToHls": "Passage en lecture HLS après un problème de flux direct.", "errorStream": "Impossible de lire la vidéo. Vérifiez la connexion au serveur.", "torrentUnavailableOnIndexer": "Ce torrent n'est plus disponible sur l'indexeur ou n'a pas pu être récupéré. Choisissez une autre source.", "streamNotReadyYet": "Le flux n'est pas encore prêt (torrent en cours d'initialisation). Attendez 1 à 2 minutes puis réessayez.", "progressBarDownloaded": "Vert = déjà téléchargé par le client", "maxTranscodingsReached": "Nombre maximum de transcodages atteint. Arrêtez les autres lectures en cours.", "maxTranscodingsReachedWithList": "Nombre maximum de transcodages atteint (max {max}). Arrêtez les autres lectures ou attendez qu'elles se terminent. Transcodages en cours : {list}", "transcodingsEvicted": "D'autres transcodages ont été arrêtés pour libérer de la place.", "seekBack": "-{seconds} s", "seekForward": "+{seconds} s", "quality": "Qualité", "qualityAuto": "Auto", "quality1080": "1080p", "quality720": "720p", "quality480": "480p", "quality360": "360p", "watchLaterAdd": "À regarder plus tard", "watchLaterRemove": "Retirer des favoris" };
const nav$1 = { "menu": "Menu", "home": "Accueil", "dashboard": "Tableau de bord", "films": "Films", "series": "Séries", "demandes": "Demandes", "library": "Bibliothèque", "search": "Recherche", "downloads": "Téléchargements", "requests": "Mes demandes", "settings": "Paramètres", "account": "Mon compte", "feedback": "Feedback", "sideNavigation": "Navigation latérale", "language": "Langue" };
const settings$1 = { "title": "Paramètres", "server": "Serveur", "serverDescription": "Configuration du serveur backend", "indexers": "Indexers", "indexersDescription": "Gérez vos sources de contenu", "sync": "Synchronisation", "syncDescription": "Paramètres de synchronisation automatique", "account": "Mon compte", "accountDescription": "Gérez votre profil et vos préférences", "uiPreferences": "Interface", "uiPreferencesDescription": "Personnalisez l'interface : thème, langue, affichage", "diagnostics": "Diagnostics", "diagnosticsDescription": "Outils de diagnostic et informations système", "audit": "Audit", "auditDescription": "Historique des actions et événements" };
const errors$1 = { "generic": "Une erreur s'est produite", "insufficientStorage": "Espace disque insuffisant. Libérez de l'espace ou augmentez votre forfait.", "network": "Erreur de connexion réseau", "unauthorized": "Non autorisé", "notFound": "Page non trouvée", "serverError": "Erreur serveur", "validationError": "Erreur de validation", "tryAgain": "Réessayer", "forbidden": "Accès refusé", "forbiddenMessage": "Vous n'avez pas les droits nécessaires pour accéder à cette page.", "notFoundMessage": "La page que vous recherchez n'existe pas ou a été déplacée.", "serverErrorMessage": "Une erreur inattendue s'est produite. Veuillez réessayer plus tard." };
const permissions$1 = { "accessDenied": "Accès refusé", "accessDeniedDescription": "Cette fonctionnalité est réservée au compte principal. Les utilisateurs locaux ont un accès limité aux paramètres.", "backToSettings": "Retour aux paramètres" };
const dashboard$1 = { "resumeWatching": "Reprendre la lecture", "rewatch": "Revoir", "popularMovies": "Films populaires", "popularSeries": "Séries populaires", "recentAdditions": "Ajouts récents", "watchLater": "À regarder plus tard", "fastTorrents": "⚡ Téléchargements rapides", "noContent": "Aucun contenu n'est disponible pour le moment.", "moviesGenre": "Films - {genre}", "seriesGenre": "Séries - {genre}", "playNew": "Lire", "downloadUnavailable": "Impossible de démarrer le téléchargement pour ce contenu." };
const search$1 = { "title": "Rechercher", "placeholder": "Rechercher un film ou une série...", "clearSearch": "Effacer la recherche", "moviesFound": "Films trouvés", "seriesFound": "Séries trouvées", "noResults": "Aucun résultat trouvé", "noResultsFor": 'Aucun {type} trouvé pour "{query}"', "newSearch": "Nouvelle recherche", "startSearch": "Commencez votre recherche", "startSearchDescription": "Recherchez des films ou des séries en utilisant la barre de recherche ci-dessus", "searchingLocal": "Recherche dans la base locale (torrents synchronisés)...", "searchingIndexers": "Recherche sur les indexeurs...", "localSearchNote": "Popcornn parcourt d'abord ta bibliothèque.", "indexerSearchNote": "Aucun résultat local. Popcornn interroge les indexeurs.", "mustBeLoggedIn": "Vous devez être connecté pour rechercher du contenu", "content": "contenu", "noTorrentsUseRequest": "Aucun torrent trouvé pour cette recherche. Vous pouvez demander ces médias pour qu'ils soient ajoutés.", "tmdbMoviesRequest": "Films (TMDB) — Demander", "tmdbSeriesRequest": "Séries (TMDB) — Demander", "tmdbRequestTitle": "Résultats TMDB — Demander le média" };
const library$1 = { "title": "Bibliothèque", "empty": "Bibliothèque vide", "emptyDescription": "Les médias téléchargés apparaîtront ici automatiquement.", "viewDownloads": "Voir les téléchargements", "syncLibrary": "Synchroniser la bibliothèque", "scanStarted": "Scan démarré avec succès. La bibliothèque sera mise à jour automatiquement.", "scanning": "Scan en cours...", "syncInProgress": "Synchronisation de la bibliothèque en cours…", "latestDownload": "Dernier téléchargement", "playLatest": "Lire maintenant", "films": "Films", "series": "Séries", "others": "Autres", "sharedBy": "Partagé par {name}", "downloadingSection": "En cours de téléchargement", "downloadingBadge": "En cours", "badgePopcorn": "Popcornn", "badgeLocal": "Local", "badgeExternalLibrary": "Bibliothèque externe", "badgeSharedByFriend": "Partagé par un ami", "filterAll": "Tous", "filterFilms": "Films", "filterSeries": "Séries", "filterSourceAll": "Toutes sources", "filterSourcePopcorn": "Popcornn", "filterSourceExternal": "Bibliothèque externe", "filterSourceShared": "Partagés", "filterSourceLocal": "Local", "genreOther": "Autres", "mediaCount": "{count} média(s) sur disque", "seriesGroupedHint": "Les séries sont regroupées : une carte = une série (plusieurs épisodes).", "seriesGroupedShort": "séries regroupées", "episodesInLibrary": "{count} épisode en bibliothèque", "episodesInLibrary_plural": "{count} épisodes en bibliothèque" };
const torrentStats$1 = { "downloading": "Téléchargement en cours", "queued": "En file d'attente", "speed": "Vitesse", "eta": "Temps restant", "peers": "{count} peer(s)", "seeding": "Partage actif", "uploadSpeed": "Vitesse d'upload" };
const downloads$1 = { "title": "Téléchargements", "noActiveDownloads": "Aucun téléchargement actif", "torrentsWillAppear": "Les torrents que vous ajoutez apparaîtront ici", "activeDownloads": "{count} téléchargement{plural} actif{plural}", "addTorrentFile": "Ajouter fichier .torrent", "addMagnetLink": "Ajouter magnet link", "adding": "Ajout en cours...", "pauseAll": "Pause tous", "resumeAll": "Reprendre tous", "removeAll": "Supprimer tous", "removeWithFiles": "Supprimer avec fichiers", "confirmRemove": "Voulez-vous supprimer ce torrent{withFiles} ?", "confirmRemoveAll": "Voulez-vous supprimer tous les torrents ?", "andFiles": " et ses fichiers", "magnetLinkLabel": "Lien magnet:", "magnetPlaceholder": "magnet:?xt=urn:btih:...", "enterMagnetLink": "Voulez entrer un lien magnet", "logs": "Journal", "logsTitle": "Journal de diagnostic", "logsFiltered": "{count} log(s) affiché(s) (répétitions filtrées) • Mise à jour automatique toutes les 5 secondes", "noLogs": "Aucun log disponible", "loadingLogs": "Chargement des logs...", "loadingDownloads": "Chargement des téléchargements...", "clientLogs": "Logs client", "sessionUptime": "Temps de session", "verificationTitle": "Vérification du téléchargement", "verificationSubtitle": "Vérification de la disponibilité et des pairs en cours…", "verificationDone": "Vérification terminée", "verificationTimeout": "Vérification en attente (timeout). Le téléchargement peut tout de même être en cours.", "nopeersWarning": "Aucun pair trouvé. Ce torrent pourrait ne pas être disponible actuellement.", "cancelAndRemove": "Annuler et supprimer", "cancelDownload": "Annuler le téléchargement", "confirmDeleteTorrentTitle": "Supprimer le torrent", "confirmDeleteTorrentMessage": "Supprimer ce torrent du client et supprimer les fichiers du disque ? Cette action est irréversible.", "removing": "Suppression...", "states": { "queued": "En attente", "downloading": "Téléchargement", "seeding": "Partage", "paused": "En pause", "completed": "Terminé", "error": "Erreur", "unknown": "Inconnu" }, "stats": { "downloadSpeed": "Vitesse DL", "uploadSpeed": "Vitesse UL", "peers": "Peers", "seeds": "Graines", "seeders": "Graines", "eta": "ETA", "size": "Taille", "totalSize": "Taille totale", "active": "Actif", "waiting": "En attente", "activeSharing": "Partage actif" }, "actions": "Actions", "progress": "Progression", "private": "Privé", "statusReason": "Statut détaillé", "notLinkedToTmdb": "Non associé à un média (ajout manuel ou pas encore synchronisé)", "notLinkedToTmdbShort": "Non associé" };
const settingsMenu$1 = /* @__PURE__ */ JSON.parse(`{"title":"Paramètres","subtitle":"Configurez votre application selon vos préférences","openMenu":"Ouvrir le menu Paramètres","overview":"Vue d'ensemble","overviewCard":{"syncOk":"Sync OK","syncInProgress":"Synchronisation en cours…","syncLastDate":"Dernière sync : {date}","syncIndexersCount":"{count} indexeur(s)","syncNoData":"Aucune sync pour l'instant","serverConnected":"Serveur connecté","serverOffline":"Serveur hors ligne","accountLoggedIn":"Connecté","accountNotLoggedIn":"Non connecté","indexersCount":"{count} indexeur(s) configuré(s)"},"favorites":"À regarder plus tard","category":{"system":"Système","interface":"Interface","content":"Indexers","library":"Bibliothèque","discovery":"Découverte","account":"Compte","playback":"Lecture","maintenance":"Maintenance"},"maintenance":{"forceCleanup":{"title":"Nettoyage cache","description":"Supprime les répertoires de cache HLS/transcodage inactifs (vidéos non en cours de lecture). Libère de l'espace et arrête les processus ffmpeg orphelins.","action":"Forcer le nettoyage","success":"Nettoyage effectué.","successCount":"Nettoyage effectué. {count} élément(s) supprimé(s)."},"transcodingConfig":{"title":"Transcodages","description":"Limite le nombre de flux HLS/FFmpeg simultanés. Réduire cette valeur limite la charge CPU. Sur NAS (ex. ZimaCube), mettre 1 est recommandé pour éviter une consommation excessive.","maxLabel":"Transcodages simultanés max","range":"Entre {min} et {max}","saveSuccess":"Paramètre enregistré."},"resources":{"title":"Ressources","description":"Mémoire et CPU du serveur, et disponibilité de l'accélération matérielle (GPU) pour FFmpeg.","processMemory":"Mémoire processus","processCpu":"CPU processus","systemMemory":"Mémoire système","gpuAcceleration":"Accélération matérielle (FFmpeg)","gpuAvailable":"Disponible","gpuNotAvailable":"Non disponible","gpuNotAvailableHint":"En Docker : monter le GPU dans le stack. l’image par défaut (FFmpeg sans GPU). Pour l’activer : variante « Popcornn (Nvidia GPU) » pour que l'accélération s'affiche. Variantes CasaOS : « Popcornn (VAAPI GPU) » ou « Popcornn (Nvidia GPU) ».","refresh":"Actualiser","unavailableOrOldBackend":"Impossible de charger les ressources. Si votre serveur n'a pas été mis à jour récemment, cette fonctionnalité peut être indisponible (endpoint /api/media/resources)."},"resourcesMonitorDev":{"title":"Monitor ressources","description":"Consommation CPU et mémoire du serveur en temps réel.","pause":"Pause","resume":"Reprendre","cpuHistory":"CPU (dernières 10 min)","memoryHistory":"Mémoire processus (dernières 10 min)","tipsTitle":"Pistes d'amélioration","tipSyncInterval":"Augmenter l'intervalle de synchronisation (Paramètres > Sync) pour réduire la charge au repos.","tipLibraryScan":"Réduire la fréquence du scan bibliothèque ou le désactiver (intervalle à 0) si inutile.","tipStartupScan":"Le scan bibliothèque au démarrage est désactivé par défaut ; garder POPCORN_LIBRARY_SCAN_ON_STARTUP non défini."}},"setup":{"title":"Configuration","description":"Rouvrir l'assistant de configuration pour configurer votre client"},"uiPreferences":{"title":"Préférences","description":"Personnalisez l'interface : thème, langue, affichage"},"server":{"title":"Serveur","description":"Configurez l'URL du serveur Popcornn auquel se connecter"},"tmdb":{"title":"TMDB","description":"Clé API TMDB pour enrichir les métadonnées"},"indexers":{"title":"Indexers","description":"Configurez votre clé API TMDB (obligatoire) et vos indexers pour rechercher et télécharger des torrents"},"indexersConfigured":{"title":"Indexers","description":"Liste des indexers et paramètres"},"indexerParams":{"description":"Fréquence, auto-sync, mots-clés"},"flaresolverr":{"title":"FlareSolverr","description":"Contourner Cloudflare pour les indexers custom"},"flaresolverrPanel":{"intro":"FlareSolverr permet d'accéder aux indexers dont le site affiche une vérification Cloudflare (« Checking your browser »).","configureBackend":"L'URL FlareSolverr se configure côté serveur (variable d'environnement FLARESOLVERR_URL, ex. dans Docker/CasaOS).","perIndexer":"Pour chaque indexer de type « custom » concerné, cochez « Utiliser FlareSolverr » dans le formulaire d'ajout ou d'édition de l'indexer.","statusConfigured":"FlareSolverr est configuré sur ce serveur.","statusNotConfigured":"FlareSolverr n'est pas configuré sur ce serveur. Définissez FLARESOLVERR_URL (ex. http://flaresolverr:9191) pour l'activer.","testConnectivity":"Test de connectivité","testChecking":"Vérification en cours…","testOperational":"FlareSolverr est opérationnel et joignable.","testUnreachable":"FlareSolverr ne répond pas ou n'est pas joignable.","docLink":"Documentation (CasaOS / Docker)","openUrlLabel":"URL pour ouvrir la page FlareSolverr","openUrlPlaceholder":"ex. http://localhost:9191","save":"Enregistrer","saveSuccess":"Enregistré.","saveError":"Erreur lors de l'enregistrement.","openPage":"Ouvrir la page FlareSolverr"},"syncCategories":{"title":"Catégories sync","description":"Films, séries, genres par indexer","selectorDescription":"Sélectionnez les catégories que vous souhaitez synchroniser pour cet indexer"},"indexerDefinitions":{"title":"Définitions d'indexeurs","subtitle":"Gérer les définitions d'indexeurs partagées (pays, langue). Création, modification et suppression selon vos droits."},"sync":{"title":"Sync torrents","description":"Gérez la synchronisation automatique des torrents depuis les indexers"},"diagnostics":{"title":"Diagnostics","description":"Tester la connexion backend, la version et les indexers"},"storage":{"title":"Stockage","description":"Espace disque utilisé et limite du forfait"},"librqbit":{"title":"Client torrent","description":"Configuration et surveillance du client torrent intégré"},"librqbitWeb":{"title":"librqbit Web","description":"Ouvrir l'interface web du client torrent dans un nouvel onglet"},"mediaPaths":{"title":"Dossiers médias","description":"Définir les dossiers de téléchargement par type (films, séries), comme Jellyfin"},"mediaPathsPanel":{"intro":"Choisissez le dossier dans lequel enregistrer les téléchargements pour chaque type. Les chemins sont relatifs au dossier racine du serveur.","filmsPath":"Dossier des films","seriesPath":"Dossier des séries","browse":"Parcourir","chooseFolder":"Choisir ce dossier","loading":"Chargement…","saveSuccess":"Chemins enregistrés (backend et cloud).","saveError":"Erreur lors de l'enregistrement.","browseTitle":"Sélectionner un dossier","noSubfolders":"Aucun sous-dossier."},"librarySources":{"title":"Dossiers externes","description":"Ajouter des dossiers hors du serveur (ex. autre NAS) pour les inclure dans la bibliothèque"},"libraryMedia":{"title":"Médias de la bibliothèque","description":"Voir le nombre de médias, modifier les chemins ou supprimer une entrée de la base"},"libraryMediaPanel":{"intro":"Liste des fichiers indexés dans la bibliothèque (films et épisodes). Vous pouvez corriger un chemin si le fichier a été déplacé ou retirer une entrée de l'index (le fichier sur disque n'est pas supprimé).","loading":"Chargement…","totalCount":"{count} entrée(s) en base","filmsCount":"Films : {count}","seriesCount":"Séries (fichiers) : {count}","localCount":"Local : {count}","externalCount":"Externe : {count}","filter":"Filtrer","filterType":"Type","filterSource":"Source","sourceLocal":"Source locale (dossier de téléchargement)","sourceExternal":"Bibliothèques externes","noMedia":"Aucun média indexé pour ce filtre.","colTitle":"Titre / Fichier","colPath":"Chemin","colCategory":"Type","colSource":"Source","colActions":"Actions","editPath":"Modifier le chemin","removeFromLibrary":"Retirer de la bibliothèque","removeFromLibraryConfirm":"Retirer cette entrée de la bibliothèque ? Le fichier sur disque ne sera pas supprimé.","removeFromLibrarySuccess":"Entrée retirée de la bibliothèque.","deleteFileAndLibrary":"Supprimer le fichier","deleteFileConfirm":"Supprimer le fichier du disque et retirer de la bibliothèque ? Cette action est irréversible. (Uniquement pour les médias du répertoire local.)","deleteFileSuccess":"Fichier supprimé et entrée retirée de la bibliothèque.","deleteFileError":"Impossible de supprimer le fichier (répertoire local uniquement).","updateSuccess":"Chemin mis à jour.","updateError":"Impossible de mettre à jour le chemin.","deleteConfirm":"Retirer cette entrée de la bibliothèque ? Le fichier sur disque ne sera pas supprimé.","deleteSuccess":"Entrée retirée de la bibliothèque.","deleteError":"Impossible de supprimer l'entrée."},"librarySourcesPanel":{"intro":"Ajoutez des dossiers contenant des films ou séries (ex. sur un autre NAS). Après validation, un scan et un enrichissement TMDB seront lancés.","pathPlaceholder":"Ex. \\\\\\\\zimacube.local\\\\Movies ou smb://zimacube.local/Movies","browse":"Parcourir l'arborescence","browseTitle":"Choisir un dossier local","chooseCurrentFolder":"Utiliser ce dossier","noFolders":"Aucun sous-dossier disponible ici.","browseError":"Impossible de charger l'arborescence pour ce dossier.","pathFormatTitle":"Quel format utiliser ?","pathFormatWindows":"Windows (Explorateur) : ouvrez le dossier dans l’Explorateur, puis copiez le chemin dans la barre d’adresse → \\\\\\\\ordinateur\\\\partage\\\\dossier","pathFormatMac":"macOS (Finder) : menu Aller → Se connecter au serveur, entrez l’adresse du serveur → smb://ordinateur/partage/dossier","pathFormatNote":"Le chemin doit être accessible depuis la machine où tourne le serveur (sous Linux, utilisez le point de montage, ex. /mnt/nas/Movies).","category":"Type de contenu","categoryFilm":"Films","categorySeries":"Séries","labelOptional":"Nom de la bibliothèque (optionnel)","shareWithFriends":"Partager avec les amis","addSource":"Ajouter le dossier","editSource":"Modifier la source","saveSource":"Enregistrer les modifications","scan":"Lancer le scan","syncing":"Synchronisation…","synchronized":"Synchronisé","delete":"Supprimer","loading":"Chargement…","addSuccess":"Dossier ajouté. Scan en cours en arrière-plan.","addError":"Impossible d'ajouter le dossier.","updateSuccess":"Source mise à jour.","updateError":"Impossible de modifier la source.","scanStarted":"Scan démarré.","deleteSuccess":"Source supprimée.","enabled":"Activée","disabled":"Désactivée","enableSource":"Activer cette source","disableSource":"Désactiver cette source","enabledSuccess":"Source activée.","disabledSuccess":"Source désactivée.","noSources":"Aucun dossier externe. Ajoutez un chemin (films ou séries) pour l'intégrer à la bibliothèque.","stats":"{mediaCount} médias, {folderCount} dossiers"},"versions":{"title":"Versions","description":"Client, backend et mises à jour"},"account":{"title":"Mon Compte","description":"Consultez et gérez les informations de votre compte utilisateur"},"feedback":{"title":"Feedback","description":"Envoyez vos retours et suivez les réponses de l'équipe"},"friends":{"title":"Amis","description":"Gérer vos amis, le partage et l'activité"},"localUsers":{"title":"Utilisateurs locaux","description":"Gérer les comptes locaux avec permissions limitées","inviteTitle":"Inviter un utilisateur local","inviteDescription":"Invitez des utilisateurs à créer un compte local avec des permissions limitées.","sendInvitation":"Envoyer l'invitation","inviting":"Envoi en cours…","listTitle":"Utilisateurs locaux ({count})","noLocalUsers":"Aucun utilisateur local pour le moment","emailRequired":"Email *","displayNameOptional":"Nom d'affichage (optionnel)","emailPlaceholder":"utilisateur@exemple.com","displayNamePlaceholder":"Jean Dupont","active":"Actif","pending":"En attente","emailNotVerified":"Email non vérifié","createdOn":"Créé le {date}","resendInvitation":"Renvoyer l'invitation","delete":"Supprimer","deleteConfirm":"Êtes-vous sûr de vouloir supprimer l'utilisateur {email} ?","mainAccountOnly":"Cette page est réservée au compte principal. Veuillez vous connecter avec votre compte cloud.","inviteSuccess":"Invitation envoyée avec succès","inviteError":"Erreur lors de l'envoi de l'invitation","resendSuccess":"Invitation renvoyée avec succès","resendError":"Erreur lors du renvoi de l'invitation","deleteSuccess":"Utilisateur supprimé avec succès","deleteError":"Erreur lors de la suppression","loadError":"Impossible de charger les utilisateurs locaux. Veuillez vous reconnecter avec votre compte principal.","noToken":"Aucun token cloud. Veuillez vous connecter avec votre compte principal.","tokenExpired":"Session expirée. Veuillez vous reconnecter avec votre compte principal."},"documentation":{"title":"Documentation","description":"Guide utilisateur et aide (s'ouvre sur le site)"},"subscription":{"title":"Abonnement(s)","description":"Consulter le statut de vos abonnements et options","notConnected":"Connectez-vous à votre compte cloud pour voir vos abonnements.","connectToCloud":"Se connecter sur le site","plan":"Abonnement stockage","planName":"Forfait","status":"Statut","storage":"Stockage cloud","periodEnd":"Fin de période","noStoragePlan":"Aucun abonnement stockage actif.","streamingTorrentOption":"Option streaming torrent","streamingTorrentActive":"Active : vous pouvez lire un torrent en streaming sans le télécharger entièrement.","streamingTorrentInactive":"Inactive. Gérée sur le site (compte cloud).","manageOnWeb":"Gérer mon compte sur le site"},"quickLinks":"Liens rapides"}`);
const serverSettings$1 = { "title": "Configuration du serveur", "backendUrl": "URL du Backend Rust", "backendUrlPlaceholder": "http://127.0.0.1:3000", "examples": "Exemples: http://127.0.0.1:3000 (local) ou http://192.168.1.100:3000 (réseau local)", "storageInfo": "Cette URL est stockée dans localStorage et utilisée par les routes API du client Astro pour faire le proxy vers le backend Rust. Le backend Rust utilise le port 3000 par défaut.", "testConnection": "Tester la connexion", "testAndSave": "Tester et Sauvegarder", "reset": "Réinitialiser", "testing": "Test en cours...", "saving": "Sauvegarde...", "loadingConfig": "Chargement de la configuration...", "currentUrl": "URL du backend Rust actuelle:", "urlStoredInfo": "Cette URL est stockée dans localStorage et utilisée par les routes API du client.", "enterUrl": "Veuillez entrer une URL", "invalidUrl": "URL invalide. Format attendu: http://ip:port ou https://domaine.com", "protocolError": "Le protocole doit être http:// ou https://", "connectionSuccess": "Connexion réussie ! Le backend Rust est accessible.", "connectionError": "Impossible de se connecter au backend Rust ({status}). Vérifiez que l'URL est correcte et que le backend Rust est démarré.", "savedSuccess": "Configuration sauvegardée avec succès dans localStorage !", "savedMixedContent": "URL sauvegardée. Test ignoré car la page est en HTTPS et le backend en HTTP (Mixed Content).", "resetSuccess": "Configuration réinitialisée à la valeur par défaut.", "mixedContentError": "La page est en HTTPS et le backend est en HTTP. Le navigateur bloque ce test (Mixed Content). Utilisez un backend HTTPS ou un reverse proxy.", "clientUrlLabel": "URL du client (webOS / connexion rapide)", "clientUrlPlaceholder": "ex. http://192.168.1.100:4321", "clientUrlHelp": "Optionnel. URL à laquelle ce client est accessible (pour la TV webOS et le QR de connexion rapide). Si vide, l’adresse actuelle est utilisée lors de l’enregistrement.", "info": { "title": "Informations", "point1": "L'URL du backend Rust est stockée dans localStorage (côté client)", "point2": "Cette URL est utilisée par les routes API du client Astro pour faire le proxy vers le backend Rust", "point3": "Assurez-vous que le backend Rust est démarré et accessible sur cette URL", "point4": "Le backend Rust utilise le port 3000 par défaut (configurable via BACKEND_PORT)" } };
const indexerDefinitionsManager$1 = { "title": "Définitions d'indexeurs", "manageDefinitions": "Gérer les définitions d'indexeurs", "addDefinition": "Ajouter une définition", "noDefinitions": "Aucune définition disponible", "definitionsCount": "{count} définition(s)", "country": "Pays", "language": "Langue", "protocol": "Protocole", "connectionType": "Type de connexion", "type": { "public": "Public", "semiPrivate": "Semi-privé", "private": "Privé" }, "table": { "id": "ID", "name": "Nom", "creator": "Créateur", "actions": "Actions" }, "creator": { "system": "Système" }, "form": { "idLabel": "ID (identifiant unique)", "idPlaceholder": "ex: mon-indexer", "nameLabel": "Nom", "namePlaceholder": "Nom d'affichage", "versionLabel": "Version", "descriptionLabel": "Description", "descriptionPlaceholder": "Description optionnelle", "searchEndpointLabel": "Search endpoint", "searchEndpointPlaceholder": "/api/...", "httpMethodLabel": "Méthode HTTP", "countryPlaceholder": "ex: FR, US", "languagePlaceholder": "ex: fr, en", "requiresApiKey": "Clé API requise", "requiresAuth": "Authentification requise", "searchParams": "searchParams (JSON)", "responseMapping": "responseMapping (JSON)", "categoryMapping": "categoryMapping (JSON)", "ui": "ui (JSON)", "advanced": "Avancé", "downloadUrlTemplate": "Modèle d'URL de téléchargement", "downloadUrlTemplateHelp": "Modèle pour l'URL de téléchargement. Utilisez {baseUrl}, {id}, {apiKey} comme variables." }, "confirmDeleteDefinition": "Supprimer cette définition d'indexeur ?", "errorLoad": "Erreur lors du chargement", "errorCreate": "Erreur lors de la création", "errorUpdate": "Erreur lors de la mise à jour", "errorDelete": "Erreur lors de la suppression", "createdByYou": "Créée par vous", "loginRequired": "Connexion cloud requise pour créer ou modifier des définitions.", "searchPlaceholder": "Rechercher par id ou nom…", "noResultsSearch": "Aucune définition ne correspond à la recherche." };
const indexersManager$1 = { "title": "Indexers", "addIndexer": "Ajouter un indexer", "editIndexer": "Modifier l'indexer", "noIndexers": "Aucun indexer configuré", "confirmDelete": "Êtes-vous sûr de vouloir supprimer cet indexer ?", "loading": "Chargement...", "selectIndexer": "Sélectionner un indexer", "cancel": "Annuler", "noDefinitions": "Aucune définition d'indexer disponible", "searchPlaceholder": "Rechercher par nom ou description…", "filterByLanguage": "Langue", "filterByCountry": "Pays", "filterAll": "Toutes / Tous", "noResultsForSearch": "Aucun indexeur ne correspond à votre recherche ou aux filtres.", "select": "Sélectionner", "basedOn": "Basé sur", "required": "Requis", "optional": "Optionnel", "apiKeyRequired": "Clé API requise", "authRequired": "Authentification requise", "useJackettLabel": "Utiliser Jackett (optionnel)", "useJackettDescription": "Afficher les indexeurs qui passent par Jackett. Désactivé : seuls les indexeurs intégrés (connexion directe, sans application tierce) sont proposés.", "errorLoading": "Erreur lors du chargement des indexers", "errorSaving": "Erreur lors de la sauvegarde", "errorDeleting": "Erreur lors de la suppression", "errorTesting": "Erreur lors du test de connexion", "syncStarted": "Synchronisation démarrée. Les résultats apparaîtront dans quelques instants.", "cookieWizard": { "title": "Obtenir le cookie de session", "tabSimple": "Méthode simple (extension)", "tabManual": "Guide pas à pas (F12)", "simpleIntro": "Utilisez une extension navigateur pour copier le cookie (y compris HttpOnly). Cookie-Editor est gratuit et open source.", "simpleStep1": "Installez l'extension Cookie-Editor : Chrome ou Firefox (voir liens ci-dessous).", "simpleStep2": "Ouvrez le site du trackeur dans un onglet et connectez-vous (reCAPTCHA si demandé).", "simpleStep3": "Cliquez sur l'icône Cookie-Editor dans la barre du navigateur. Repérez le cookie de session (souvent nommé comme le site ou « session »), cliquez sur l'icône copier à côté de sa valeur.", "simpleStep4": "Revenez dans Popcornn et collez (Ctrl+V) dans le champ « Cookie (session) », ou utilisez la zone de dépôt ci-dessous.", "extensionName": "Cookie-Editor", "extensionChrome": "Installer pour Chrome", "extensionFirefox": "Installer pour Firefox", "extensionNote": "D'autres extensions (ex. EditThisCookie) fonctionnent aussi. L'important est de pouvoir copier la valeur du cookie de session depuis la page du trackeur connecté.", "manualIntro": "Si vous préférez récupérer le cookie à la main (outils de développement), suivez les étapes ci‑dessous. Des captures d'écran peuvent être ajoutées plus tard.", "manualStep1Title": "Ouvrir le site du trackeur", "manualStep1Text": "Ouvrez l'URL du trackeur (la même que l'URL de base de l'indexer) dans votre navigateur. Connectez-vous avec votre compte si nécessaire (et validez le reCAPTCHA s'il s'affiche).", "manualStep2Title": "Ouvrir les outils de développement", "manualStep2Text": "Appuyez sur F12 (ou clic droit → Inspecter). Allez dans l'onglet « Application » (Chrome/Edge) ou « Stockage » (Firefox), puis « Cookies » et sélectionnez le site du trackeur.", "manualStep3Title": "Copier le cookie", "manualStep3Text": "Repérez le cookie de session (souvent nommé comme le site ou « session »). Clic droit sur la valeur → Copier, ou double-cliquez pour sélectionner et copiez (Ctrl+C). Vous pouvez aussi copier toute la ligne « Cookie » si votre navigateur l'affiche.", "manualStep4Title": "Coller dans Popcornn", "manualStep4Text": "Revenez dans Popcornn, dans le formulaire de l'indexer, et collez (Ctrl+V) dans le champ « Cookie (session) ». Enregistrez. Le cookie expire après un moment ; en cas d'échec plus tard, refaites ces étapes et mettez à jour le champ.", "screenshotPlaceholder": "Capture d'écran à venir" }, "form": { "name": "Nom", "baseUrl": "URL de base", "apiKey": "Clé API", "username": "Nom d'utilisateur", "password": "Mot de passe", "cookie": "Cookie (session)", "cookiePlaceholder": "Coller la valeur du cookie de session ici", "cookieDropZone": "Glissez le cookie ici ou collez (Ctrl+V)", "cookiePasteButton": "Coller depuis le presse-papiers", "cookieHelp": "Ce trackeur utilise une connexion par cookie. Pour l'obtenir : (1) Ouvrez le site du trackeur dans votre navigateur et connectez-vous (reCAPTCHA si demandé). (2) Ouvrez les outils de développement (F12) → onglet Application (ou Stockage) → Cookies → sélectionnez le site. (3) Repérez le cookie de session (souvent le nom du site ou « session ») et copiez toute sa valeur. (4) Collez-la ici. Le cookie expire après un certain temps ; en cas d'échec de recherche, reconnectez-vous sur le site et mettez à jour ce champ.", "cookieWizardOpen": "Guide : comment obtenir le cookie", "jackettName": "Identifiant de l'indexeur (optionnel)", "useFlareSolverr": "Utiliser FlareSolverr (Cloudflare)", "useFlareSolverrHelp": "Recommandé si le site affiche une vérification Cloudflare. Le backend doit avoir FLARESOLVERR_URL configuré.", "enable": "Activer", "default": "Par défaut", "priority": "Priorité" }, "saving": "Sauvegarde..." };
const indexerCard$1 = { "active": "Actif", "inactive": "Inactif", "default": "Par défaut", "priority": "Priorité", "syncButton": "Synchroniser", "syncing": "Synchronisation…", "testSuccess": "Test réussi", "testFailed": "Test échoué", "connectionSuccess": "Connexion réussie", "connectionError": "Erreur de connexion", "apiKeyTest": "Clé API / passkey", "firstTested": "testée en premier", "torrentsFoundTotal": "torrent(s) trouvé(s) au total", "categoriesReturned": "Catégories retournées :", "films": "Films", "series": "Séries", "queriesSuccessOutOf": "requête(s) réussie(s) sur", "failedQueries": "Requêtes échouées :", "downloadFormatsAvailable": "Formats de téléchargement disponibles (Torznab 1.3) :", "magnetAvailable": "Magnet link disponible", "torrentFileAvailable": "Fichier .torrent disponible", "resultsWithMagnet": "résultat(s) avec magnet link sur", "resultsWithTorrentFile": "résultat(s) avec fichier .torrent sur", "tested": "testé(s)", "torznabLinkOrder": "Selon Torznab 1.3 : les liens sont récupérés dans l'ordre", "exampleResults": "Exemples de résultats :", "noTmdbId": "Pas d'ID TMDB", "guidTorznab": "GUID Torznab (pour téléchargement via API)", "guidUsedForDownload": "Le GUID est utilisé avec l'API Torznab pour télécharger le fichier .torrent", "downloadFormatTorznab": "Format de téléchargement (Torznab) :", "magnetLinkEnclosure": "Magnet link (magneturl/enclosure)", "magnetLink": "Magnet link", "torrentFile": "Fichier .torrent", "noLinkAvailable": "Aucun lien disponible", "downloadTestTorrentFile": "Test de téléchargement du fichier .torrent", "guidUsed": "GUID utilisé :", "detailsTorznab": "Détails Torznab (enclosure/link/guid)", "magnetUri": "Magnet URI (magneturl/enclosure)", "downloadLink": "Lien de téléchargement", "torznabSourceOrder": "(selon Torznab 1.3: enclosure → link → guid)", "torznabSource": 'Source Torznab : peut provenir de <enclosure url="...">, <link> ou <guid>', "downloadUrlAlternative": "URL de téléchargement (alternative)", "noDownloadLinkInResults": "Aucun lien de téléchargement disponible dans les résultats de test", "torrentsFoundTest": "torrent(s) trouvé(s) lors du test", "exampleResult": "Exemple de résultat :", "size": "Taille :", "testing": "Test en cours...", "testButton": "Tester", "edit": "Modifier", "delete": "Supprimer", "seeders": "seeders", "peers": "peers" };
const indexerTestModal$1 = { "title": "Test de l'indexer {name}", "testing": "Test en cours...", "progressLog": "Progression", "waitingFirstResult": "En attente des premiers résultats...", "close": "Fermer" };
const setupIndexersStep$1 = { "selectDefinitionTitle": "Choisir une définition d'indexeur", "manualHint": "Si ton indexer n'est pas dans la liste, tu peux le configurer manuellement.", "noDefinitions": "Aucune définition disponible", "configureManually": "Configurer manuellement", "apiKeyRequired": "Clé API requise", "select": "Sélectionner", "addIndexer": "Ajouter un indexer", "addDefinition": "Ajouter une définition d'indexeur", "basedOnDefinition": "Basé sur la définition :", "searchPlaceholder": "Rechercher par nom ou description…", "filterByLanguage": "Langue", "filterByCountry": "Pays", "filterAll": "Toutes / Tous", "suggestedForYourLanguage": "Suggestions pour votre langue", "noResultsForSearch": "Aucun indexeur ne correspond à votre recherche ou aux filtres." };
const indexerDefinitionDocs$1 = { "open": "Documentation", "title": "Documentation — définition d'indexeur", "intro": "Cette documentation explique comment remplir tous les champs d'une définition d'indexeur.\n\nAstuce: si tu n'es pas sûr, pars d'un indexer existant et adapte seulement l'endpoint + les mappings.", "sections": { "basics": "Champs de base", "request": "Requête (search)", "mappings": "Mappings (réponse / catégories / UI)", "options": "Options", "examples": "Exemple (Torznab / Jackett / Prowlarr)", "commonMistakes": "Erreurs fréquentes" }, "fields": { "id": 'Identifiant unique (stable). Utilisé comme indexerTypeId côté client. Recommandé: minuscules, chiffres, tirets.\nEx: "ygg-torznab"', "name": `Nom affiché à l'utilisateur. Peut contenir des espaces.
Ex: "YggTorrent"`, "version": 'Version de ta définition (utile pour suivre les changements).\nEx: "1.0.0"', "description": 'Description optionnelle (affichée dans la liste).\nEx: "Indexeur FR via Torznab"', "protocol": 'Type/protocole. "torznab" est le cas le plus courant (Jackett/Prowlarr). "rest" / "newznab" / "custom" selon ton API.', "country": `Pays de l'indexeur (ISO-2 conseillé).
Ex: "FR"`, "language": 'Langue principale (ISO-639-1 conseillé).\nEx: "fr"', "searchEndpoint": 'Chemin (ou URL) qui sera appelé pour lancer une recherche.\nTu peux utiliser un placeholder "{indexer}" si ton endpoint le requiert.\nEx: "/api/v2.0/indexers/{indexer}/results/torznab"', "searchMethod": "Méthode HTTP utilisée par l'endpoint (GET ou POST).", "searchParams": "JSON des paramètres à envoyer. Pour Torznab: souvent vide ici car la requête est construite côté indexer.\nTu peux mettre des paramètres statiques si ton endpoint en a besoin.", "responseMapping": "JSON qui mappe les champs de la réponse vers les champs attendus (title, id/guid, size, seeders, leechers, link, uploaded_at...).\nLes valeurs indiquent le nom de champ (ou de clé) dans la réponse.", "categoryMapping": "JSON de mapping catégorie -> code(s) de catégorie attendus par l'indexeur.\nEx: films=2000, series=5000 (Torznab).", "ui": "JSON d'informations d'UI (icône, couleur, champs additionnels). Optionnel: utilisé pour mieux présenter l'indexeur côté client.", "requiresApiKey": "Si coché: l'UI doit considérer la clé API comme requise pour configurer l'indexer.", "requiresAuth": "Si coché: l'indexer nécessite une authentification (en plus/à la place d'une clé API)." }, "examples": { "torznabIntro": "Exemple typique (Torznab via Jackett/Prowlarr). L'utilisateur renseignera ensuite l'URL de base + la clé API dans la config de l'indexer.", "torznabSnippet": 'protocol: torznab\nsearchEndpoint: /api/v2.0/indexers/{indexer}/results/torznab\nsearchMethod: GET\ncountry: FR\nlanguage: fr\ncategoryMapping: { "films": "2000", "series": "5000" }\nresponseMapping: { "results": "Results", "title": "Title", "id": "Guid", "size": "Size", "seeders": "Seeders", "leechers": "Peers", "uploaded_at": "PublishDate", "link": "Link" }', "note": "Note: selon ton backend/proxy, la baseUrl est demandée à l'utilisateur au moment de configurer l'indexer (pas dans la définition)." }, "mistakes": { "endpoint": `Endpoint: vérifier qu'il commence par "/" (si relatif) et qu'il correspond bien à l'API cible.`, "json": "JSON: attention aux virgules, guillemets et accolades. Un JSON invalide fera échouer la création/mise à jour.", "mapping": "Mapping: si un champ est mal mappé (ex: id/title), les résultats peuvent être vides ou incomplets.", "countryLanguage": "Pays/Langue: renseigne-les pour permettre le filtrage et éviter des définitions ambiguës." } };
const loginForm$1 = { "title": "Connexion", "emailPassword": "Email / Mot de passe", "quickConnect": "Connexion rapide", "email": "Email", "emailPlaceholder": "votre@email.com", "password": "Mot de passe", "passwordPlaceholder": "Votre mot de passe", "submit": "Se connecter", "submitting": "Connexion...", "noAccount": "Pas de compte ?", "register": "S'inscrire", "errors": { "dbNotConfigured": "Le serveur n'a pas de base de données configurée. Veuillez contacter l'administrateur du serveur.", "invalidCredentials": "Email ou mot de passe incorrect", "serverError": "Erreur serveur. Le serveur n'est peut-être pas correctement configuré.", "networkError": "Erreur de connexion. Vérifiez votre connexion réseau et l'URL du serveur dans les paramètres." } };
const registerForm$1 = { "title": "Inscription", "email": "Email", "emailPlaceholder": "votre@email.com", "password": "Mot de passe", "passwordPlaceholder": "Choisissez un mot de passe", "confirmPassword": "Confirmer le mot de passe", "confirmPasswordPlaceholder": "Confirmez votre mot de passe", "submit": "S'inscrire", "submitting": "Inscription...", "hasAccount": "Déjà un compte ?", "login": "Se connecter" };
const errorPage$1 = { "back": "Retour", "home": "Accueil" };
const legacySettings$1 = { "serverConfig": "Configuration du serveur", "serverConfigDesc": "Configurez l'URL du serveur Popcornn auquel se connecter", "serverUrl": "URL du serveur", "serverUrlExample": "Exemple: http://192.168.1.100:4321 ou https://popcorn.example.com", "urlRequired": "URL du serveur requise", "invalidUrl": "URL invalide", "configSaved": "Configuration sauvegardée !", "preferences": "Préférences", "darkTheme": "Thème sombre", "autoplay": "Lecture automatique", "info": "Informations", "version": "Version", "type": "Type", "lightClient": "Client léger", "infoDescription": "Cette application est un client léger. Toute la logique métier (torrents, indexers, streaming) est gérée par le serveur distant.", "legalInfo": "Informations légales", "readDisclaimer": "Lire l'avertissement et la clause de non-responsabilité →", "disclaimerImportant": "Important : Veuillez lire attentivement le disclaimer avant d'utiliser cette application." };
const header$1 = { "home": "Accueil", "features": "Fonctionnalités", "documentation": "Documentation", "search": "Recherche", "library": "Bibliothèque", "settings": "Paramètres", "dashboard": "Tableau de bord", "logout": "Déconnexion", "login": "Connexion", "register": "S'inscrire" };
const pageHeader$1 = { "back": "Retour" };
const sync$1 = { "inProgress": "Synchronisation en cours", "syncInProgress": "Synchronisation en cours", "syncPending": "Synchronisation en attente...", "syncStarting": "Démarrage de la synchronisation...", "syncComplete": "Synchronisation terminée", "syncCompleted": "Synchronisation terminée", "syncDescription": "Les contenus sont en cours de synchronisation depuis vos indexers.", "filmsSyncDescription": "Les films sont en cours de synchronisation depuis vos indexers.", "seriesSyncDescription": "Les séries sont en cours de synchronisation depuis vos indexers.", "noFilmsSynced": "Aucun film synchronisé", "noSeriesSynced": "Aucune série synchronisée", "noTorrentsSynced": "Aucun torrent synchronisé", "startSyncDescription": "Commencez par synchroniser vos indexers pour découvrir vos films.", "startSyncSeriesDescription": "Commencez par synchroniser vos indexers pour découvrir vos séries.", "startSyncAllDescription": "Commencez par synchroniser vos indexers pour découvrir vos contenus.", "starting": "Démarrage...", "startSync": "Démarrer la synchronisation", "configureIndexers": "Configurer les indexers", "goToSyncSettings": "Aller aux paramètres de synchronisation →", "configureTmdbKey": "Configurer la clé TMDB", "syncInfo": "La synchronisation récupère les torrents depuis vos indexers configurés et les enrichit avec les métadonnées TMDB.", "noIndexerActivated": "Aucun indexer activé. Veuillez configurer au moins un indexer dans les paramètres.", "tmdbTokenMissing": "Token TMDB manquant. Veuillez configurer votre token TMDB dans les paramètres.", "noFilmsAvailable": "Aucun film disponible", "noFilmsAvailableDescription": "Aucun film n'est disponible pour le moment.", "noSeriesAvailable": "Aucune série disponible", "noSeriesAvailableDescription": "Aucune série n'est disponible pour le moment.", "checkConsole": "Vérifiez la console pour plus de détails.", "allFilms": "Tous les films", "allSeries": "Toutes les séries", "syncStartingBackend": "Démarrage de la synchronisation...", "backendConnecting": "Connexion au backend en cours. Le backend peut prendre quelques secondes à démarrer.", "fetchingTorrents": "Récupération des torrents (avant insertion)", "torrentsFetched": "torrent(s) récupéré(s)", "pages": "page(s)", "currentIndexer": "Indexer actuel", "torrents": "torrents", "category": "Catégorie", "processingTorrents": "Traitement des torrents", "globalProgress": "Progression globale", "torrentsSynced": "torrents synchronisés", "totalSynced": "Total synchronisé", "noTorrentsFound": "Aucun torrent trouvé pour le moment. La synchronisation continue.", "waitForSync": "Veuillez patienter pendant la synchronisation. Vous pourrez continuer une fois terminée.", "syncFromIndexers": "Synchronisation des torrents depuis les indexers...", "syncFirstTime": "Lancez la première synchronisation pour récupérer les torrents depuis vos indexers configurés.", "syncWillQuery": "La synchronisation va interroger vos indexers activés pour récupérer les torrents disponibles.", "syncMayTakeTime": "Cette opération peut prendre plusieurs minutes selon le nombre d'indexers et de torrents.", "torrentsOrganized": "Les torrents seront organisés par catégorie (films, séries)", "tmdbMetadataAuto": "Les métadonnées TMDB seront ajoutées automatiquement si configurées", "canRelaunchSync": "Vous pourrez relancer une synchronisation depuis les paramètres plus tard", "previous": "Précédent", "launchSync": "Lancer la synchronisation", "torrentsSyncedSuccess": "Les torrents ont été synchronisés avec succès depuis vos indexers.", "canContinueToFinal": "Vous pouvez maintenant continuer vers l'étape finale pour accéder au dashboard.", "continue": "Continuer", "accessDashboardNow": "Accéder au dashboard maintenant", "canWaitOrAccess": "Vous pouvez attendre la fin de la synchronisation ou accéder directement au dashboard.", "checkingSyncStatus": "⏳ Vérification de l'état de la synchronisation...", "syncTorrentsInProgress": "🔄 Synchronisation des torrents en cours...", "canStartUsing": "Vous pouvez maintenant commencer à utiliser Popcornn pour rechercher et regarder vos contenus préférés.", "browserNoVideo": "Votre navigateur ne supporte pas la lecture de vidéos." };
const syncProgress$1 = { "starting": "Démarrage de la synchronisation...", "backendConnecting": "Connexion au backend en cours. Le backend peut prendre quelques secondes à démarrer.", "inProgress": "Synchronisation en cours", "pending": "Synchronisation en attente...", "fetching": "Récupération des torrents (avant insertion)", "torrentsFetched": "torrent(s) récupéré(s)", "pages": "page(s)", "currentIndexer": "Indexer actuel", "torrents": "torrents", "category": "Catégorie", "processing": "Traitement des torrents", "globalProgress": "Progression globale", "torrentsSynced": "torrents synchronisés", "totalSynced": "Total synchronisé", "noTorrentsFound": "Aucun torrent trouvé pour le moment. La synchronisation continue." };
const completeStep$1 = { "configurationComplete": "Configuration terminée !", "clientReady": "Votre client Popcornn est maintenant configuré et prêt à l'emploi.", "checkingStatus": "⏳ Vérification de l'état de la synchronisation...", "syncInProgress": "🔄 Synchronisation des torrents en cours...", "waitOrAccess": "Vous pouvez attendre la fin de la synchronisation ou accéder directement au dashboard.", "syncComplete": "✅ Synchronisation terminée", "canStartUsing": "Vous pouvez maintenant commencer à utiliser Popcornn pour rechercher et regarder vos contenus préférés.", "browserNoVideo": "Votre navigateur ne supporte pas la lecture de vidéos.", "accessDashboardNow": "Accéder au dashboard maintenant" };
const syncStep$1 = { "syncTorrents": "Synchronisation des torrents", "launchFirstSync": "Lancez la première synchronisation pour récupérer les torrents depuis vos indexers configurés.", "syncWillQuery": "La synchronisation va interroger vos indexers activés pour récupérer les torrents disponibles.", "mayTakeTime": "Cette opération peut prendre plusieurs minutes selon le nombre d'indexers et de torrents.", "torrentsOrganized": "Les torrents seront organisés par catégorie (films, séries)", "tmdbAuto": "Les métadonnées TMDB seront ajoutées automatiquement si configurées", "canRelaunch": "Vous pourrez relancer une synchronisation depuis les paramètres plus tard", "previous": "Précédent", "starting": "Démarrage...", "launchSync": "Lancer la synchronisation", "inProgress": "Synchronisation en cours", "fromIndexers": "Synchronisation des torrents depuis les indexers...", "pleaseWait": "⏳ Veuillez patienter pendant la synchronisation. Vous pourrez continuer une fois terminée.", "completed": "Synchronisation terminée !", "syncedSuccess": "Les torrents ont été synchronisés avec succès depuis vos indexers.", "continueToFinal": "Vous pouvez maintenant continuer vers l'étape finale pour accéder au dashboard.", "continue": "Continuer" };
const settingsPages$1 = { "indexers": { "title": "Indexers", "subtitle": "Configurez TMDb et vos indexers pour la recherche" }, "indexerDefinitions": { "title": "Définitions d'indexeurs", "subtitle": "Gérez les définitions partagées (pays, langue, endpoints, mappings)." }, "sync": { "title": "Synchronisation", "subtitle": "Gérez la synchronisation automatique des torrents", "configureIndexers": "Configurer les indexers" }, "favorites": { "title": "À regarder plus tard", "subtitle": "Médias que vous avez ajoutés aux favoris. Ils sont synchronisés avec votre compte cloud.", "empty": "Aucun média dans la liste. Ajoutez des films ou séries depuis leur page détail.", "open": "Voir" }, "debugSync": { "pageTitle": "Debug Sync (provisoire)", "pageSubtitle": "Tester si un torrent est réellement téléchargeable (GET + Range, bencode).", "title": "Vérification téléchargeabilité", "subtitle": "Indexer + ID torrent : le backend teste l’URL de téléchargement (GET Range 0-63, premier octet 'd').", "indexerId": "Indexer", "torrentId": "ID torrent", "torrentIdPlaceholder": "ex. info_hash ou id selon l’indexer", "loadingIndexers": "Chargement…", "check": "Vérifier", "checking": "Vérification…", "fillBoth": "Renseignez l’indexer et l’ID du torrent.", "errorGeneric": "Erreur lors de la vérification.", "downloadable": "Téléchargeable", "notDownloadable": "Non téléchargeable", "debugLink": "Debug (provisoire)" }, "diagnostics": { "title": "Diagnostics", "healthTitle": "État du backend", "healthSubtitle": "Vérifie la disponibilité, la latence et la version", "check": "Tester", "checking": "Test en cours...", "backendReachable": "Backend accessible", "backendUnreachable": "Backend indisponible", "latency": "Latence", "version": "Version", "downloadDir": "Répertoire de téléchargement", "ffmpeg": "FFmpeg", "torrentClient": "Client torrent", "librqbitVersion": "Version librqbit", "unknown": "Indisponible", "ok": "OK", "ko": "KO", "ffmpegHint": "FFmpeg : vérifiez les logs du serveur en cas d'erreur HLS", "errorGeneric": "Impossible de récupérer l'état du backend" }, "storage": { "title": "Stockage", "subtitle": "Espace disque utilisé par les téléchargements (et limite si forfait)", "used": "Utilisé", "available": "Espace libre", "refresh": "Actualiser", "checking": "Chargement...", "errorGeneric": "Impossible de récupérer les statistiques de stockage", "retentionLabel": "Conserver les médias", "retentionDays": "{days} jours", "retentionDontKeep": "Ne pas garder (supprimer après lecture)", "retentionDisabled": "Désactivé" }, "friends": { "title": "Amis", "subtitle": "Invitez des amis, configurez le partage et consultez l'activité.", "librariesSharedExplanation": "Les bibliothèques (films, séries) que vous partagez seront visibles par vos amis. Choisissez pour chaque ami ce que vous souhaitez partager : rien, tout, ou une sélection." }, "account": { "title": "Mon compte", "subtitle": "Gérez votre profil (avatar/nom) et consultez vos informations" }, "feedback": { "title": "Feedback", "subtitle": "Envoyez vos retours et suivez les réponses de l'équipe" }, "server": { "title": "Serveur", "subtitle": "Configurez l'URL du serveur Popcornn auquel se connecter" }, "quickConnect": { "title": "Connexion rapide", "description": "Scannez le QR code ou saisissez le code pour connecter un nouvel appareil à votre compte.", "codeLabel": "Code", "qrAlt": "QR code de connexion rapide", "scanHint": "Scannez avec l'app ou ouvrez le lien sur un appareil déjà connecté à votre compte.", "expiresIn": "Expire dans", "waitingAuth": "En attente d'autorisation…", "authorized": "Autorisé", "connectedSuccess": "Appareil connecté avec succès.", "regenerateCode": "Régénérer le code", "initError": "Impossible de démarrer la connexion rapide.", "codeExpired": "Ce code a expiré. Générez-en un nouveau.", "connectError": "Erreur lors de la connexion de l'appareil." }, "librqbit": { "title": "Client torrent", "subtitle": "Configuration et surveillance du client torrent intégré", "openInNewTab": "Ouvrir dans un nouvel onglet", "sessionStats": "Activité en cours", "limits": "Limites de débit", "limitsUploadLabel": "Upload (bps)", "limitsDownloadLabel": "Download (bps)", "limitsOptional": "optionnel", "limitsHint": "Laissez vide pour illimité", "logs": "Logs", "viewLogs": "Voir les logs", "logsConnecting": "Connexion au flux…", "logsEmpty": "Aucun log", "logsClose": "Fermer", "webUiDescription": "Interface Web complète : liste des torrents, ajout magnet, statistiques.", "webUiCta": "Ouvrir l'interface Web", "dht": "Réseau DHT", "dhtStats": "Stats DHT", "dhtTable": "Table DHT", "rustLog": "Niveau de log", "rustLogPlaceholder": "info", "rustLogHint": "Ex : info, debug, warn. Redémarrage du backend requis pour prendre effet.", "uptime": "Uptime", "uptimeMinutes": "{min} min", "loading": "Chargement…", "errorLoadSession": "Impossible de charger les stats session.", "errorInvalidValues": "Valeurs numériques invalides.", "errorNoStream": "Pas de flux" } };
const friendsManager$1 = { "pageReservedForMainAccount": "Cette page est réservée au compte principal.", "pageReservedForMainAccountLong": "Cette page est réservée au compte principal. Veuillez vous connecter avec votre compte cloud.", "errorLoading": "Erreur lors du chargement", "pleaseEnterEmail": "Veuillez entrer un email", "errorInvitation": "Erreur lors de l'invitation", "friendAdded": "Ami ajouté", "confirmDeleteFriend": "Êtes-vous sûr de vouloir supprimer cet ami ?", "confirmDeleteFriendWithEmail": "Êtes-vous sûr de vouloir supprimer cet ami ({email}) ?", "errorDelete": "Erreur lors de la suppression", "friendRemoved": "Ami supprimé", "errorUpdateShare": "Erreur lors de la mise à jour du partage", "shareUpdated": "Partage mis à jour", "errorUpdate": "Erreur lors de la mise à jour", "errorLoadLibrary": "Impossible de charger la bibliothèque", "title": "Amis", "subtitle": "Invitez des amis, configurez le partage, et consultez l'activité.", "inviteFriend": "Inviter un ami", "emailRequired": "Email *", "emailPlaceholder": "ami@example.com", "displayNameOptional": "Nom d'affichage (optionnel)", "displayNamePlaceholder": "Alice", "sending": "Envoi en cours...", "sendInvitation": "Envoyer l'invitation", "myFriends": "Mes amis", "refresh": "Rafraîchir", "noFriends": "Aucun ami pour le moment.", "currentShare": "Partage actuel", "viewShare": "Voir partage", "shareType": "Type de partage", "shareNone": "Aucun", "shareAll": "Tout", "shareSelected": "Sélection", "selectMedia": "Sélectionner des médias", "mediaSelectedCount": "{count} média(s) sélectionné(s)", "recentActivity": "Activité récente", "noActivity": "Aucune activité.", "selectMediaToShare": "Sélectionner les médias à partager", "noMediaSelectable": "Aucun média sélectionnable (assurez-vous que la bibliothèque est enrichie).", "apply": "Appliquer" };
const torrentSyncManager$1 = { "status": "Statut", "inactive": "Inactif", "refresh": "Rafraîchir", "inProgress": "En cours...", "elapsedSince": "En cours depuis {time}", "elapsedSinceLabel": "En cours depuis", "syncInProgressShort": "Sync…", "lastSync": "Dernière sync: {date}", "neverSynced": "Aucune synchronisation effectuée", "synchronizationInProgress": "Synchronisation en cours", "currentIndexer": "Indexer actuel", "category": "Catégorie", "searchQuery": "Requête de recherche", "torrentProcessing": "Traitement des torrents", "afterFiltering": "Après filtrage et enrichissement TMDB", "recentErrors": "Erreurs récentes", "activeIndexers": "Indexers actifs", "progress": "Progression", "films": "Films", "series": "Séries", "others": "Autres", "distributionChart": "Répartition", "tmdb": "TMDB", "tmdbEnrichmentThisIndexer": "Enrichissement TMDB (cet indexer)", "withTmdb": "Avec ID TMDB", "withoutTmdb": "Sans ID TMDB", "ofTorrents": "des torrents", "enriched": "enrichis", "torrentsWithoutTmdb": "Torrents sans ID TMDB", "displayingFirst": "(Affichage des 50 premiers)", "noneWithoutTmdb": "Aucun torrent sans ID TMDB trouvé", "tipNoTmdb": "💡 Ces torrents n'ont pas pu être enrichis avec les métadonnées TMDB. Vérifiez que la clé API TMDB est configurée et relancez une synchronisation.", "improveWithGemini": "Améliorer avec Gemini", "improveWithGeminiSuccess": "Règles d'enrichissement mises à jour. Relancez une synchronisation pour appliquer.", "improveWithGeminiError": "Erreur lors de l'appel à Gemini.", "improveWithGeminiAdminOnly": "Réservé aux administrateurs du cloud.", "improveWithGeminiConfigError": "Service non configuré (GEMINI_API_KEY sur popcorn-web) ou erreur temporaire.", "allHaveTmdb": "✓ Tous les torrents ont un ID TMDB et sont enrichis avec les métadonnées", "noTorrentsSynced": "Aucun torrent synchronisé", "noContentInDatabase": "Aucun contenu en base", "lastSyncNoResults": "La dernière synchronisation n'a retourné aucun résultat", "activeIndexersCount": "Indexers actifs ({count}):", "noIndexerActivated": "⚠️ Aucun indexer activé", "mustConfigureIndexer": "Vous devez configurer et activer au moins un indexer pour synchroniser des torrents.", "stopSync": "Arrêter la synchronisation", "stopping": "Arrêt en cours...", "launchSync": "Lancer une synchronisation", "launchSyncThisIndexer": "Lancer la sync (cet indexer)", "clearTorrents": "Vider les torrents", "clearing": "Suppression...", "downloadLog": "Télécharger le journal", "downloadLogError": "Impossible de télécharger le journal de synchronisation.", "settings": "Paramètres", "syncFrequency": "Fréquence de synchronisation automatique", "currently": "Actuellement", "autoSyncEnabled": "Synchronisation automatique activée", "maxTorrentsPerCategory": "Nombre maximum de torrents par catégorie", "maxTorrentsPerCategoryHint": "Nombre maximum de torrents par catégorie (films, séries). 0 = illimité.", "advanced": "Avancé", "rssIncremental": "RSS Torznab (incremental) — rattraper les nouveaux torrents entre deux sync", "rssIncrementalNote": "Recommandé si tu utilises Torznab/Jackett. (N'affecte pas les indexers non‑Torznab)", "filmKeywords": "Mots‑clés de synchronisation — Films (1 par ligne)", "filmKeywordsPlaceholder": "Ex: *\n2024\n2023\nnouveau\nrecent", "filmKeywordsNote": "Utilisés comme complément si RSS n'est pas disponible ou insuffisant. Laisse vide pour utiliser les valeurs par défaut (*, 2024, 2023, nouveau, recent).", "seriesKeywords": "Mots‑clés de synchronisation — Séries (1 par ligne)", "seriesKeywordsPlaceholder": "Ex: *\n2024\n2023\nnouvelle\nrecente", "seriesKeywordsNote": "Utilisés comme complément si RSS n'est pas disponible ou insuffisant. Laisse vide pour utiliser les valeurs par défaut (*, 2024, 2023, nouvelle, recente).", "settingsNotAvailable": "⚠️ Les paramètres de synchronisation ne sont pas disponibles. Rechargez la page.", "confirmClearAll": "Êtes-vous sûr de vouloir supprimer tous les torrents synchronisés ? Cette action est irréversible.", "stopSyncConfirm": "Arrêter la synchronisation", "stopSyncConfirmDesc": "Êtes-vous sûr de vouloir arrêter la synchronisation ?", "settingsSaved": "Paramètres mis à jour avec succès", "errorUpdating": "Erreur lors de la mise à jour des paramètres", "syncStopped": "Synchronisation arrêtée avec succès", "syncStarted": "Synchronisation démarrée. Les résultats apparaîtront dans quelques instants.", "errorStopping": "Erreur lors de l'arrêt de la synchronisation", "torrentsCleared": "✅ {count} torrent(s) supprimé(s) avec succès", "torrentsSynced": "Torrents synchronisés", "totalSynced": "Total synchronisé", "errorClearing": "Erreur lors de la suppression des torrents", "never": "Jamais", "minutes": "minute(s)", "hours": "heure(s)", "days": "jour(s)", "raw": "bruts", "toProcess": "à traiter", "fetched": "récupérés", "synchronized": "synchronisés", "noTorrentsFound": "Aucun torrent trouvé", "syncInProgressNoResults": "La synchronisation est en cours mais aucun résultat n'a été retourné pour le moment.", "indexersQueried": "Indexers interrogés:", "noResultsAfter": "⚠️ Aucun résultat après {time}", "checkBackendLogs": "Vérifiez les logs du backend ou testez les indexers individuellement.", "processingInProgress": "Traitement en cours", "torrentsFetchedEnriching": "{count} torrent(s) récupéré(s), en cours d'enrichissement et d'insertion en base de données.", "bruts": "bruts", "fetchedFromIndexers": "récupérés (indexeurs)", "inDatabase": "en base", "fetchThenEnrich": "TMDB", "enrichingInProgress": "Enrichissement en cours…", "phaseFetch": "Phase 1 — Récupération", "phaseFetchExplanation": "Les pages RSS sont récupérées. Aucun film n’est encore en base : l’enrichissement TMDB et l’insertion commenceront une fois la récupération terminée.", "phaseEnrich": "Phase 2 — Enrichissement et insertion", "phaseEnrichProgress": "{current} / {total} traités", "statsByIndexer": "Par indexer", "syncIndexersTitle": "Indexers à synchroniser", "allIndexers": "Tous les indexers", "selectAtLeastOneIndexer": "Sélectionnez au moins un indexer pour lancer la synchronisation.", "fullScan": "Lancer le scan complet", "indexersSection": "Indexeurs", "indexerFetching": "Récupération…", "indexerEnriching": "Enrichissement…", "indexerDone": "Terminé", "indexerError": "Erreur", "newContentsFound": "{count} torrent(s) récupéré(s)", "newContentsFoundTooltip": "Torrents bruts récupérés de l’indexer. Les Films/Séries affichés dépendent du match TMDB (enrichissement).", "filmsSeriesSynced": "{films} Films, {series} Séries synchronisés", "recentActivity": "Activité récente", "noSyncInProgress": "Aucune synchronisation en cours", "activityTitle": "Ce qui se passe", "syncTriggerManual": "Démarrage manuel (bouton Scan)", "syncTriggerScheduled": "Synchronisation planifiée (automatique)", "activityLogTitle": "Dernières lignes du journal", "nextSyncIn": "Prochaine sync planifiée dans {minutes} min", "nextSyncDisabled": "Sync automatique désactivée", "progressGlobal": "Progression globale", "connectionError": "Erreur de connexion", "lastErrors": "Dernières erreurs", "indexerDetails": "Détails de l'indexer", "close": "Fermer", "filmsCount": "Films", "seriesCount": "Séries", "othersCount": "Autres", "totalInDb": "Total en base", "sourceUrl": "URL source", "clickForDetails": "Cliquer pour voir les détails", "pageSummary": "Résumé", "progressTitle": "État de la synchronisation", "filterAll": "Tous", "progressLabel": "Progression", "tabOverview": "Vue d'ensemble", "tabSettings": "Paramètres", "toolsAriaLabel": "Outils", "startBackendToSeeData": "Démarrez le backend pour voir les données.", "settingsAvailableWhenBackendConnected": "Paramètres disponibles une fois le backend connecté.", "custom": "personnalisé", "tmdbEnrichmentPrefix": "Enrichissement TMDB : ", "clickIndexerCardAbove": "Cliquez sur une carte indexeur ci‑dessus pour voir les détails et la liste." };
const backendDiagnostics$1 = { "title": "Diagnostics réseau (Android/Desktop)", "description": "Vérifie les endpoints utilisés par l'app en build statique.", "backendConfigured": "Backend configuré:", "openAudit": "🔍 Ouvrir la page Audit (teste toutes les méthodes de communication)", "altIp": "IP alternative à tester", "willTestBoth": "Le diagnostic testera les deux URLs: celle configurée et celle-ci.", "emulatorNote": "📱 10.0.2.2 est l'IP spéciale de l'émulateur Android pour accéder au localhost de la machine hôte. Les tests avec cette IP échoueront si vous n'êtes pas sur un émulateur Android.", "runOnBoot": "Lancer cette page automatiquement au démarrage", "runOnBootNote": "En pratique: si activé, l'app redirige vers /settings/diagnostics au lancement.", "rerun": "Relancer", "testing": "Test en cours…", "test": "Test", "status": "Statut", "duration": "Durée", "detail": "Détail", "loading": "Chargement…", "report": "Rapport", "copy": "Copier", "copied": "Rapport copié dans le presse-papiers.", "copyFallback": "Rapport copié (fallback).", "copyManual": "Impossible de copier automatiquement. Sélectionne le texte et copie manuellement.", "reportTip": "Astuce: colle ce JSON dans un message, ça me permet de diagnostiquer très vite (DNS/LAN, cleartext, auth, endpoints)." };
const versionInfo$1 = { "updateAvailable": "Mise à jour disponible", "updateBadge": "↑ v{version}", "updateAvailableClient": "Une nouvelle version du client est disponible (v{latest}). Vous utilisez v{current}.", "updateAvailableServer": "Une nouvelle version du backend est disponible (v{latest}). Vous utilisez v{current}.", "updateAvailableBoth": "De nouvelles versions sont disponibles pour le client (v{clientLatest}) et le backend (v{serverLatest}).", "dockerInstructions": "En déploiement Docker, mettez à jour depuis l'hôte : docker compose pull && docker compose up -d", "checkingUpdates": "Vérification des mises à jour...", "hardResetTitle": "Hard Reset", "hardResetDescription": "Efface complètement la base du backend et déconnecte cet appareil.", "hardResetAction": "Hard Reset", "hardResetInProgress": "Reset en cours...", "hardResetConfirm": "Confirmer le Hard Reset ? Toutes les données du backend seront supprimées.", "hardResetError": "Impossible d'effectuer le hard reset." };
const frTranslations = {
  common: common$1,
  demo: demo$1,
  ads: ads$1,
  requests: requests$1,
  requestsAdmin: requestsAdmin$1,
  feedback: feedback$1,
  backend: backend$1,
  blacklist: blacklist$1,
  discover: discover$1,
  languages: languages$1,
  wizard: wizard$1,
  account: account$1,
  interfaceSettings: interfaceSettings$1,
  playback: playback$1,
  nav: nav$1,
  settings: settings$1,
  errors: errors$1,
  permissions: permissions$1,
  dashboard: dashboard$1,
  search: search$1,
  library: library$1,
  torrentStats: torrentStats$1,
  downloads: downloads$1,
  settingsMenu: settingsMenu$1,
  serverSettings: serverSettings$1,
  indexerDefinitionsManager: indexerDefinitionsManager$1,
  indexersManager: indexersManager$1,
  indexerCard: indexerCard$1,
  indexerTestModal: indexerTestModal$1,
  setupIndexersStep: setupIndexersStep$1,
  indexerDefinitionDocs: indexerDefinitionDocs$1,
  loginForm: loginForm$1,
  registerForm: registerForm$1,
  errorPage: errorPage$1,
  legacySettings: legacySettings$1,
  header: header$1,
  pageHeader: pageHeader$1,
  sync: sync$1,
  syncProgress: syncProgress$1,
  completeStep: completeStep$1,
  syncStep: syncStep$1,
  settingsPages: settingsPages$1,
  friendsManager: friendsManager$1,
  torrentSyncManager: torrentSyncManager$1,
  backendDiagnostics: backendDiagnostics$1,
  versionInfo: versionInfo$1
};
const common = { "next": "Next", "previous": "Previous", "save": "Save", "cancel": "Cancel", "close": "Close", "loading": "Loading...", "error": "Error", "success": "Success", "confirm": "Confirm", "delete": "Delete", "edit": "Edit", "search": "Search", "logout": "Logout", "login": "Login", "register": "Register", "yes": "Yes", "no": "No", "or": "or", "and": "and", "optional": "optional", "required": "required", "add": "Add", "apply": "Apply", "retry": "Retry", "back": "Back", "configure": "Configure", "test": "Test", "open": "Open", "pause": "Pause", "resume": "Resume", "all": "All", "film": "Film", "serie": "Series", "content": "Content", "download": "Download", "watch": "Watch", "torrents": "Torrents", "details": "Details", "other": "Other", "others": "Others", "verification": "Checking...", "noData": "No data available", "unknownError": "Unknown error" };
const demo = { "entryLoading": "Opening demo...", "exitDemo": "Exit demo mode", "modeActive": "Demo mode active", "badge": "Demo", "modeActiveDescription": "Data and actions are simulated. To use your account and backend, exit demo mode." };
const ads = { "adLabel": "Advertisement", "skip": "Skip", "skipIn": "Skip in {seconds}s", "start": "Start ad", "unavailable": "Ad unavailable", "trailerWatchOnYoutube": "Watch trailer on YouTube", "trailerEmbedUnsupported": "Embedded playback is not available on this device (e.g. TV).", "trailerPlay": "Play trailer" };
const requests = { "myRequests": "My requests", "myRequestsExplanation": "This page lists all the media you have requested (films, series). Each request goes through an approval process: pending, approved or declined. When approved, the media is automatically downloaded.", "noRequests": "You haven't requested any content yet.", "discoverContent": "Discover content", "statusPending": "Pending", "statusApproved": "Approved", "statusDeclined": "Declined", "statusUnknown": "Unknown", "errorLoad": "Failed to load requests", "requestMedia": "Request", "requestSubmitted": "Request submitted", "cancelRequest": "Cancel request", "requestCancelled": "Request cancelled", "requestSuccess": "Request submitted successfully", "requestAlreadyExists": "A request already exists for this media", "quotaExceeded": "Request quota exceeded", "requestedOn": "Requested on", "confirmDelete": "Are you sure you want to cancel this request?" };
const requestsAdmin = { "title": "Manage requests", "description": "Approve or decline user media requests. Approved requests trigger automatic downloads.", "explanation": 'When users request films or series (via the "Request" button on a media page), their requests appear here. As an administrator, you can approve or decline each request. Approved requests trigger an automatic download of the selected media.', "approve": "Approve", "decline": "Decline", "notes": "Notes", "noPendingRequests": "No pending requests" };
const feedback = { "requireCloud": "Sign in with a cloud account to send feedback.", "conversations": "Conversations", "noThreads": "No conversations", "admin": "Team", "you": "You", "newThread": "New conversation", "newMessage": "New message", "newMessageDesc": "Send a message to the team to report an issue or suggestion.", "subjectPlaceholder": "Subject", "contentPlaceholder": "Your message...", "replyPlaceholder": "Your reply...", "send": "Send", "newReply": "New reply", "newReplyBody": "You have received a new reply to your feedback", "unread": "unread" };
const backend = { "badgeTitleOk": "Backend server running", "badgeTitleError": "Backend server stopped or error", "badgeTitleChecking": "Checking server...", "statusOk": "Server", "statusError": "Offline", "statusChecking": "…", "menuTitle": "Local server", "versionLabel": "Version", "startServer": "Start server", "stopServer": "Stop server", "restartServer": "Restart server" };
const blacklist = { "title": "Blacklist", "description": "Exclude films and series from discovery and requests", "explanation": "The blacklist allows you to exclude certain films or series from discovery and from being requested. Blacklisted media will not appear in the home page carousels and users cannot request them.", "noItems": "No blacklisted media", "addToBlacklist": "Add to blacklist", "removeFromBlacklist": "Remove from blacklist" };
const discover = { "sliders": "Discover sliders", "slidersExplanation": 'Sliders are the themed carousels displayed on the home page (e.g. "Trending films", "Popular series"). They let you customize what content is shown to users. Initialize the default sliders to get started, then enable or disable them as needed.', "configureSliders": "Configure sliders", "discoverMovies": "Discover movies", "discoverSeries": "Discover series", "initializeDefaults": "Initialize default sliders", "enabled": "Enabled", "disabled": "Disabled", "noSliders": "No sliders configured", "noTorrentsYet": "No torrents have been found for this media yet. Use the Request button to ask an administrator to add it. Once approved, the download will start automatically.", "requestThisMedia": "Request this media", "requestSubmitted": "Your request has been submitted.", "requestAlreadySubmitted": "You have already requested this media.", "releaseDateExpected": "Expected release {date}", "releasedOn": "Released on {date}", "missingParams": "Missing parameters (tmdbId, type)", "description": "Customize home page carousels (trending films, popular series, etc.)", "popularMovies": "Popular movies", "popularSeries": "Popular series", "topRatedMovies": "Top rated movies", "topRatedSeries": "Top rated series", "cinemaReleases": "Cinema releases", "vodReleases": "VOD releases", "newReleases": "New releases", "pageSubtitle": "Discover films and series to request" };
const languages = { "fr": "Français", "en": "English" };
const wizard = /* @__PURE__ */ JSON.parse(`{"language":{"title":"Choose your language","description":"Select the interface language. You can change it at any time in the settings.","selectLanguage":"Interface language"},"serverUrl":{"title":"Server Configuration","description":"Enter the URL of your Popcornn backend server","placeholder":"https://your-server.com","testConnection":"Test connection","connectionSuccess":"Connection successful!","connectionError":"Unable to connect to server","step1FirstTimeTitle":"Initial setup","step1FirstTimeSubtitle":"Connect this client to your server: scan the QR code from your phone (or another already-configured device), or enter the server URL here.","step1ReconfigureTitle":"Change configuration","step1ReconfigureSubtitle":"Change the server URL or add this device via the QR code.","connectClientTitle":"Connect this client","choiceQuestion":"How would you like to proceed?","choiceFirstTime":"This is my first time setting up","choiceFirstTimeDesc":"I've never configured Popcornn. I want to enter the server URL here or do the setup from my phone.","choiceAlreadyConfigured":"I've already configured Popcornn","choiceAlreadyConfiguredDesc":"Another device (phone, TV, computer) is already connected. I want to scan its QR code or enter the code to get the configuration.","choiceLocalAccount":"Local account","choiceLocalAccountDesc":"I received an invitation (local account). The server URL is already provided or I'll enter it — no need to scan a QR code or enter a code on popcorn-web.","backToQrOrCode":"Back to QR code or code","mobileWelcome":"Welcome!","mobileChoiceIntro":"Choose how to connect this device:","mobileJoinExisting":"I already have an account and server","mobileJoinExistingDesc":"Scan the QR code shown on an already-configured TV or computer to get the server URL and sign in.","mobileFirstInstall":"First-time setup on this device","mobileFirstInstallDesc":"Enter your server URL manually, then continue setup on this device.","scanQRCode":"Scan QR code","scanQRCodeDesc":"Allow camera access to scan the QR code shown on your TV or computer","enterCodeManually":"Enter code manually","enterCodeDesc":"If you can't scan, enter the 6-character code shown on the other device","manualConfig":"Manual configuration","manualConfigDesc":"Enter the server URL manually (first-time setup)","cameraPermissionError":"Camera access denied","cameraPermissionHelp":"To scan the QR code, you must allow camera access in the app settings.","qrScanError":"Unable to scan QR code","qrScanErrorHelp":"Make sure the QR code is visible and the camera works. You can also enter the code manually below.","tvInstructionsTitle":"Connect with your phone","tvStep1":"On your phone, open the Popcornn app or popcorn-web (signed in to your account).","tvStep2":"Scan this QR code or open the link shown.","tvStep3":"On the page that opens: sign in if needed, set the server URL if not done yet, then tap \\"Authorize\\".","tvStep4":"Go to popcorn-web and enter this code to authorize this device.","tvQrAlsoSetupFromPhone":"You can do the full initial setup from your phone: open the link (QR or code), sign in to your account, set the server URL if needed, then authorize this code.","tvWaitingAuth":"Waiting for authorization from your phone...","tvAuthorized":"Authorized! Connecting...","tvExpiresIn":"Expires in","tvSeconds":"seconds","tvOrEnterCode":"Code to enter on popcorn-web (same as in the QR code)","openPopcornWebToAuthorize":"Open popcorn-web to authorize (code included in link)","errors":{"backendRequired":"Please enter a server URL","invalidUrl":"Invalid URL","invalidUrlFormat":"Invalid URL format. Use: http://192.168.1.100:3000 or https://your-domain.com","invalidProtocol":"Protocol must be http:// or https://","connectionFailed":"Unable to connect to server","connectionFailedDetails":"Check that:\\n• Popcornn server is running\\n• The IP address is correct\\n• Your device and server are on the same Wi-Fi network","backendNotAccessible":"Server not accessible","backendNotAccessibleDetails":"Check that the Popcornn server is running and the URL is correct","saveError":"Error saving configuration","quickConnectInitError":"Unable to start quick connect","quickConnectInitErrorDetails":"Check your internet connection and try again","codeExpired":"Connection code expired","codeExpiredDetails":"Connection codes expire after a few minutes. Generate a new code.","codeInvalid":"Invalid or expired code","codeInvalidDetails":"Make sure you scanned the correct QR code or entered the correct 6-character code","codeWrongLength":"Code must be exactly 6 characters","connectionError":"Connection error","connectionErrorDetails":"An error occurred. Check your internet connection and try again","noBackendUrlInCloud":"No server URL configured","noBackendUrlInCloudDetails":"Your cloud account has no server URL. Use manual configuration to enter your server URL.","secretNotReceived":"Technical error: missing connection details","authorizationError":"Authorization error","authorizationErrorDetails":"An error occurred during authorization. Try again or use manual configuration","qrCodeInvalid":"Invalid QR code","qrCodeInvalidDetails":"The scanned QR code is not valid. Make sure you scan the code shown on your TV or computer.","networkError":"Network connection error","networkErrorDetails":"Cannot reach the server. Check your internet connection and that the server is accessible."}},"disclaimer":{"title":"Disclaimer","description":"Please read and accept the following terms before continuing","acceptTerms":"I accept the terms of use","content":"This application is intended for personal use only. The user is responsible for ensuring that their use complies with the laws in force in their country."},"auth":{"title":"Sign in / Sign up","description":"Sign in with your Popcornn.app account","usePopcornAccount":"","loginTab":"Sign in","registerTab":"Sign up","email":"Email","password":"Password","confirmPassword":"Confirm password","forgotPassword":"Forgot password?","loginButton":"Sign in","registerButton":"Sign up","orContinueWith":"Or continue with","quickConnect":"Quick Connect","cloudLogin":"Cloud login","noAccount":"Don't have an account?","hasAccount":"Already have an account?"},"welcome":{"title":"Welcome!","description":"Initial setup of your application","cloudBackup":"Back up my configuration to the cloud","cloudBackupDescription":"Your settings will be automatically synced and restored on all your devices","importConfig":"Import cloud configuration","importConfigDescription":"Restore your configuration from the cloud","skipImport":"Configure manually","importTitle":"Import from your cloud configuration","importExplanation":"Everything saved in your cloud account is imported: indexers, TMDB key, download location, sync settings, language. Only items present in the cloud are listed below.","importedConfigTitle":"Configuration imported — you can edit the items below:","importBadgeImported":"Imported","importBadgeNothingInCloud":"Nothing in cloud","importLabelIndexers":"Indexers","importLabelTmdb":"TMDB key","importLabelCategories":"Indexer categories","importLabelDownloadLocation":"Download location","importLabelSyncSettings":"Sync settings","importLabelLanguage":"Language","modify":"Modify","importOnlyIndexersHint":"Only indexers were present in the cloud. To also import the TMDB key, download location and sync settings, check “Sync configuration to the cloud” at the end of the wizard on an already-configured device."},"indexers":{"title":"Indexers Configuration","description":"Add your indexers to search for content","addIndexer":"Add indexer","noIndexers":"No indexers configured","testIndexer":"Test","deleteIndexer":"Delete","indexerName":"Indexer name","indexerUrl":"Indexer URL","apiKey":"API Key"},"tmdb":{"title":"TMDB Configuration","description":"Configure your TMDB API key to enrich metadata","apiKeyLabel":"TMDB API Key","apiKeyPlaceholder":"Enter your TMDB API key","testKey":"Test key","getKey":"Get an API key","keyValid":"API key valid","keyInvalid":"API key invalid"},"downloadLocation":{"title":"Download Location","description":"Choose where to save your downloaded files","selectFolder":"Select folder","currentPath":"Current path","defaultPath":"Use default path","stepTitle":"Download path","stepIntro":"Enter the folder where the backend saves torrents. This path depends on how you run the server:","contextDevLabel":"Dev (local)","contextDockerLabel":"Docker","contextWindowsDaemonLabel":"Windows daemon","contextDev":"Development (local backend): path relative to the backend working directory (e.g. downloads or ./downloads) or an absolute path (e.g. C:\\\\Users\\\\...\\\\Downloads).","contextDocker":"Docker: the path is inside the container (e.g. /app/downloads). Configure the volume in docker-compose (e.g. ./data/downloads:/app/downloads) to access files on the host.","contextWindowsDaemon":"Windows daemon (service): path on the machine where the backend runs (e.g. C:\\\\Popcorn\\\\downloads). Set DOWNLOAD_DIR or the service config so the backend uses this folder.","pathLabel":"Path used by the backend","pathPlaceholder":"e.g. downloads, /app/downloads or C:\\\\Popcorn\\\\downloads","pathSavedHint":"Path saved. The backend will use this folder for downloads.","realPathLabel":"Real path used by the backend","errorRequired":"Please enter a download path","loading":"Loading path…","previous":"Previous","next":"Next"},"sync":{"title":"Synchronization","description":"Configure automatic content synchronization","enableSync":"Enable automatic synchronization","syncFrequency":"Sync frequency","minutes":"minutes","maxTorrents":"Maximum torrents per category","rssIncremental":"RSS incremental sync","filmQueries":"Film search queries","seriesQueries":"Series search queries"},"complete":{"title":"Setup Complete!","description":"Your application is ready to use","startUsing":"Start using the app","savingConfig":"Saving configuration...","configSaved":"Configuration saved successfully","startSync":"Start initial synchronization"}}`);
const account = { "title": "My Account", "defaultName": "User", "profile": "Profile", "displayName": "Display name", "displayNamePlaceholder": "Your display name", "displayNameOptionalHint": "Optional. Otherwise your email is used.", "avatar": "Avatar", "avatarTvHint": "TV: use a square image (≥ 256×256) for best results.", "invalidImage": "Please select an image (PNG, JPG or WebP).", "avatarUrl": "Avatar URL", "avatarUrlPlaceholder": "https://example.com/avatar.jpg", "uploadAvatar": "Upload image", "removeAvatar": "Remove avatar", "email": "Email", "userId": "User ID", "language": "Language", "languageDescription": "User interface language", "interfaceSettings": "Language and display", "interfaceSettingsDescription": "Customize language, theme and display preferences in the Interface section of settings.", "openInterfaceSettings": "Open interface settings", "noUserInfo": "No user information available", "logout": "Sign out", "logoutConfirm": "Are you sure you want to sign out?", "twoFactor": { "title": "Two-Factor Authentication", "descriptionShort": "Add an extra layer of security with a code sent by email at each sign-in.", "configure": "Configure 2FA", "enabled": "Enabled", "disabled": "Disabled", "enable": "Enable 2FA", "disable": "Disable 2FA", "sendCode": "Send code", "enterCode": "Enter the code received by email", "verifyCode": "Verify code" }, "quickConnect": { "title": "Quick Connect", "description": "Scan the QR code with your phone (popcorn-web), sign in then authorize this device. You can also enter the code manually.", "enterCode": "Enter quick connect code", "authorize": "Authorize", "scanHint": "Scan to open popcorn-web: sign in then authorize this device", "codeLabel": "Connection code", "expiresIn": "Expires in", "waitingAuth": "Waiting for authorization...", "authorized": "Authorized! Connecting...", "connectedSuccess": "Connected successfully!", "generateNewCode": "Generate new code", "regenerateCode": "Regenerate code", "initError": "Error initializing quick connect", "connectError": "Connection error", "codeExpired": "Code expired. Click to generate a new code.", "qrAlt": "Quick connect QR code" }, "subMenu": { "accountInfo": "Account information", "accountInfoDesc": "Email, user ID", "logoutDesc": "Sign out from this account" }, "quickLinks": "Quick links", "profileCardDescription": "Avatar, account information and sign out" };
const interfaceSettings = { "theme": "Theme", "themeDescription": "Choose the interface appearance (light, dark or automatic based on system)", "themeOptions": { "dark": "Dark", "light": "Light", "auto": "System" }, "autoplay": "Autoplay", "autoplayDescription": "Automatically start playing the next episodes", "skipIntro": "Skip intro", "skipIntroDescription": "Show a button to skip the opening credits during series", "skipIntroAuto": "Auto-skip intro", "skipIntroAutoDescription": "When starting an episode, automatically skip the opening credits", "nextEpisodeButton": "Next episode button", "nextEpisodeButtonDescription": "Show a button to skip to the next episode near the end", "introSkipSeconds": "Intro duration (seconds)", "introSkipSecondsDescription": "Intro duration in seconds (button and auto-skip)", "nextEpisodeCountdownSeconds": "Show next episode before end (seconds)", "nextEpisodeCountdownDescription": "Number of seconds before end to show the button", "streamingMode": "Default player", "streamingModeDescription": "Choose the playback system: HLS (recommended), Lucie (WebM) or direct stream (alternative mode).", "streamingModeHls": "HLS (adaptive, recommended)", "streamingModeHlsDescription": "Adaptive streaming with .ts segments (compatible with all media)", "streamingModeLucie": "Lucie (WebM segments)", "streamingModeLucieDescription": "5-second WebM segments with VP9+Opus (modern, requires browser support)", "streamingModeDirect": "Direct (non-HLS alternative)", "streamingModeDirectDescription": "Direct playback without transcoding (limited to natively supported formats)", "streamingDownloadFull": "Download full media while streaming", "streamingDownloadFullDescription": "An active subscription is what enables streaming mode. This setting only controls, when you stream: download the entire file in the background or only the part being played.", "streamingDownloadFullRequiresSubscription": "Streaming mode (and this option) require an active subscription with the streaming torrent option.", "streamingRetention": "Torrent retention", "streamingRetentionDescription": "How long to keep torrents downloaded while streaming. After this delay, they are automatically deleted to free up space.", "streamingRetentionKeep": "Keep indefinitely", "streamingRetentionDontKeep": "Don't keep (delete after playback)", "streamingRetentionDays": "{days} days", "librarySection": "Library display", "librarySectionDescription": "Customize language, quality and pagination for library lists", "showZeroSeedTorrents": "Show torrents with no seeders", "showZeroSeedTorrentsDescription": "Include torrents with 0 seeders on Films and Series pages (some may be unavailable)", "torrentsInitialLimit": "Initial load count", "torrentsInitialLimitDescription": "Number of films/series shown on first load (20-500)", "torrentsLoadMoreLimit": "Items per additional load", "torrentsLoadMoreLimitDescription": "Number of items added on each scroll (20-200)", "torrentsRecentLimit": "« Recent additions » section", "torrentsRecentLimitDescription": "Number of items in the recent additions section (20-200)" };
const playback = { "nextEpisode": "Next episode", "playLabel": "Play", "playStreamingLabel": "Play in streaming (downloading)", "downloadFullSeason": "Download full season", "resumeLabel": "Resume", "buffering": "Buffering…", "bufferingProgress": "Buffering {percent}%", "loadingVideo": "Loading video…", "preparingStream": "Preparing playback…", "streamPreparingRetry": "Preparing stream, retrying…", "streamingFallbackToHls": "Switched to HLS playback due to direct stream issue.", "errorStream": "Unable to play video. Check server connection.", "torrentUnavailableOnIndexer": "This torrent is no longer available on the indexer or could not be retrieved. Choose another source.", "streamNotReadyYet": "Stream is not ready yet (torrent still initializing). Wait 1–2 minutes and try again.", "progressBarDownloaded": "Green = already downloaded by client", "maxTranscodingsReached": "Maximum number of transcodings reached. Stop other ongoing playback.", "maxTranscodingsReachedWithList": "Maximum number of transcodings reached (max {max}). Stop other playback or wait for it to finish. Active transcodings: {list}", "transcodingsEvicted": "Other transcodings have been stopped to free up capacity.", "seekBack": "-{seconds} s", "seekForward": "+{seconds} s", "quality": "Quality", "qualityAuto": "Auto", "quality1080": "1080p", "quality720": "720p", "quality480": "480p", "quality360": "360p", "watchLaterAdd": "Watch later", "watchLaterRemove": "Remove from favorites" };
const nav = { "menu": "Menu", "home": "Home", "dashboard": "Dashboard", "films": "Films", "series": "Series", "demandes": "Requests", "library": "Library", "search": "Search", "downloads": "Downloads", "requests": "My requests", "settings": "Settings", "account": "My Account", "feedback": "Feedback", "sideNavigation": "Side navigation", "language": "Language" };
const settings = { "title": "Settings", "server": "Server", "serverDescription": "Backend server configuration", "indexers": "Indexers", "indexersDescription": "Manage your content sources", "sync": "Synchronization", "syncDescription": "Automatic synchronization settings", "account": "My Account", "accountDescription": "Manage your profile and preferences", "uiPreferences": "Interface", "uiPreferencesDescription": "Customize the interface: theme, language, display", "diagnostics": "Diagnostics", "diagnosticsDescription": "Diagnostic tools and system information", "audit": "Audit", "auditDescription": "Action and event history" };
const errors = { "generic": "An error occurred", "insufficientStorage": "Insufficient disk space. Free up space or upgrade your plan.", "network": "Network connection error", "unauthorized": "Unauthorized", "notFound": "Page not found", "serverError": "Server error", "validationError": "Validation error", "tryAgain": "Try again", "forbidden": "Access denied", "forbiddenMessage": "You don't have the required permissions to access this page.", "notFoundMessage": "The page you're looking for doesn't exist or has been moved.", "serverErrorMessage": "An unexpected error occurred. Please try again later." };
const permissions = { "accessDenied": "Access denied", "accessDeniedDescription": "This feature is reserved for the main account. Local users have limited access to settings.", "backToSettings": "Back to settings" };
const dashboard = { "resumeWatching": "Continue watching", "rewatch": "Rewatch", "popularMovies": "Popular movies", "popularSeries": "Popular series", "recentAdditions": "Recent additions", "watchLater": "Watch later", "fastTorrents": "⚡ Fast Downloads", "noContent": "No content is available at the moment.", "moviesGenre": "Movies - {genre}", "seriesGenre": "Series - {genre}", "playNew": "Play", "downloadUnavailable": "Unable to start the download for this content." };
const search = { "title": "Search", "placeholder": "Search for a movie or series...", "clearSearch": "Clear search", "moviesFound": "Movies found", "seriesFound": "Series found", "noResults": "No results found", "noResultsFor": 'No {type} found for "{query}"', "newSearch": "New search", "startSearch": "Start your search", "startSearchDescription": "Search for movies or series using the search bar above", "searchingLocal": "Searching local database (synced torrents)...", "searchingIndexers": "Searching indexers...", "localSearchNote": "Popcornn searches your library first.", "indexerSearchNote": "No local results. Popcornn is querying indexers.", "mustBeLoggedIn": "You must be logged in to search for content", "content": "content", "noTorrentsUseRequest": "No torrents found for this search. You can request these media to have them added.", "tmdbMoviesRequest": "Movies (TMDB) — Request", "tmdbSeriesRequest": "Series (TMDB) — Request", "tmdbRequestTitle": "TMDB results — Request media" };
const library = { "title": "Library", "empty": "Empty library", "emptyDescription": "Downloaded media will appear here automatically.", "viewDownloads": "View downloads", "syncLibrary": "Sync library", "scanStarted": "Scan started successfully. The library will be updated automatically.", "scanning": "Scanning...", "syncInProgress": "Syncing library…", "latestDownload": "Latest download", "playLatest": "Play now", "films": "Films", "series": "Series", "others": "Others", "sharedBy": "Shared by {name}", "downloadingSection": "Downloading", "downloadingBadge": "Downloading", "badgePopcorn": "Popcornn", "badgeLocal": "Local", "badgeExternalLibrary": "External library", "badgeSharedByFriend": "Shared by a friend", "filterAll": "All", "filterFilms": "Movies", "filterSeries": "Series", "filterSourceAll": "All sources", "filterSourcePopcorn": "Popcornn", "filterSourceExternal": "External library", "filterSourceShared": "Shared", "filterSourceLocal": "Local", "genreOther": "Other", "mediaCount": "{count} media on disk", "seriesGroupedHint": "Series are grouped: one card = one series (multiple episodes).", "seriesGroupedShort": "series grouped", "episodesInLibrary": "{count} episode in library", "episodesInLibrary_plural": "{count} episodes in library" };
const torrentStats = { "downloading": "Downloading", "queued": "Queued", "speed": "Speed", "eta": "Time remaining", "peers": "{count} peer(s)", "seeding": "Active sharing", "uploadSpeed": "Upload speed" };
const downloads = { "title": "Downloads", "noActiveDownloads": "No active downloads", "torrentsWillAppear": "Torrents you add will appear here", "activeDownloads": "{count} active download{plural}", "addTorrentFile": "Add .torrent file", "addMagnetLink": "Add magnet link", "adding": "Adding...", "pauseAll": "Pause all", "resumeAll": "Resume all", "removeAll": "Remove all", "removeWithFiles": "Remove with files", "confirmRemove": "Do you want to remove this torrent{withFiles}?", "confirmRemoveAll": "Do you want to remove all torrents?", "andFiles": " and its files", "magnetLinkLabel": "Magnet link:", "magnetPlaceholder": "magnet:?xt=urn:btih:...", "enterMagnetLink": "Please enter a magnet link", "logs": "Logs", "logsTitle": "Diagnostic logs", "logsFiltered": "{count} log(s) displayed (repetitions filtered) • Auto-refresh every 5 seconds", "noLogs": "No logs available", "loadingLogs": "Loading logs...", "loadingDownloads": "Loading downloads...", "clientLogs": "Client logs", "sessionUptime": "Uptime", "verificationTitle": "Download verification", "verificationSubtitle": "Checking availability and peers…", "verificationDone": "Verification complete", "verificationTimeout": "Verification pending (timeout). Download may still be in progress.", "nopeersWarning": "No peers found. This torrent may not be available right now.", "cancelAndRemove": "Cancel and remove", "cancelDownload": "Cancel download", "confirmDeleteTorrentTitle": "Delete torrent", "confirmDeleteTorrentMessage": "Remove this torrent from the client and delete the files from disk? This action cannot be undone.", "removing": "Removing...", "states": { "queued": "Queued", "downloading": "Downloading", "seeding": "Seeding", "paused": "Paused", "completed": "Completed", "error": "Error", "unknown": "Unknown" }, "stats": { "downloadSpeed": "DL Speed", "uploadSpeed": "UL Speed", "peers": "Peers", "seeds": "Seeds", "seeders": "Seeds", "eta": "ETA", "size": "Size", "totalSize": "Total size", "active": "Active", "waiting": "Waiting", "activeSharing": "Active sharing" }, "actions": "Actions", "progress": "Progress", "private": "Private", "statusReason": "Detailed status", "notLinkedToTmdb": "Not linked to a media (manual add or not synced yet)", "notLinkedToTmdbShort": "Not linked" };
const settingsMenu = /* @__PURE__ */ JSON.parse('{"title":"Settings","subtitle":"Configure your application according to your preferences","openMenu":"Open Settings menu","overview":"Overview","overviewCard":{"syncOk":"Sync OK","syncInProgress":"Sync in progress…","syncLastDate":"Last sync: {date}","syncIndexersCount":"{count} indexer(s)","syncNoData":"No sync yet","serverConnected":"Server connected","serverOffline":"Server offline","accountLoggedIn":"Logged in","accountNotLoggedIn":"Not logged in","indexersCount":"{count} indexer(s) configured"},"favorites":"Watch later","category":{"system":"System","interface":"Interface","content":"Indexers","library":"Library","discovery":"Discovery","account":"Account","playback":"Playback","maintenance":"Maintenance"},"maintenance":{"forceCleanup":{"title":"Cache cleanup","description":"Removes inactive HLS/transcoding cache directories (videos not currently playing). Frees space and stops orphaned ffmpeg processes.","action":"Force cleanup","success":"Cleanup completed.","successCount":"Cleanup completed. {count} item(s) removed."},"transcodingConfig":{"title":"Transcodings","description":"Limits how many HLS/FFmpeg streams can run at once. Lower values reduce CPU load. On NAS (e.g. ZimaCube), setting 1 is recommended to avoid high resource usage.","maxLabel":"Max concurrent transcodings","range":"Between {min} and {max}","saveSuccess":"Setting saved."},"resources":{"title":"Resources","description":"Server memory and CPU, and whether hardware acceleration (GPU) is available for FFmpeg.","processMemory":"Process memory","processCpu":"Process CPU","systemMemory":"System memory","gpuAcceleration":"Hardware acceleration (FFmpeg)","gpuAvailable":"Available","gpuNotAvailable":"Not available","gpuNotAvailableHint":"In Docker: expose the GPU in the stack. On CasaOS, use the « Popcornn (VAAPI GPU) » (Intel/AMD) or « Popcornn (Nvidia GPU) » variant so acceleration is available.","refresh":"Refresh","unavailableOrOldBackend":"Unable to load resources. If your server has not been updated recently, this feature may be unavailable (endpoint /api/media/resources)."},"resourcesMonitorDev":{"title":"Resource monitor","description":"Real-time server CPU and memory usage.","pause":"Pause","resume":"Resume","cpuHistory":"CPU (last 10 min)","memoryHistory":"Process memory (last 10 min)","tipsTitle":"Improvement tips","tipSyncInterval":"Increase sync interval (Settings > Sync) to reduce idle load.","tipLibraryScan":"Reduce library scan frequency or set interval to 0 if not needed.","tipStartupScan":"Library scan at startup is disabled by default; keep POPCORN_LIBRARY_SCAN_ON_STARTUP unset."}},"setup":{"title":"Setup","description":"Reopen the setup wizard to configure your client"},"uiPreferences":{"title":"Preferences","description":"Customize the interface: theme, language, display"},"server":{"title":"Server","description":"Configure the Popcornn server URL to connect to"},"tmdb":{"title":"TMDB","description":"TMDB API key for metadata enrichment"},"indexers":{"title":"Indexers","description":"Configure your TMDB API key (required) and your indexers to search and download torrents"},"indexersConfigured":{"title":"Indexers","description":"Indexer list and settings"},"indexerParams":{"description":"Frequency, auto-sync, keywords"},"flaresolverr":{"title":"FlareSolverr","description":"Bypass Cloudflare for custom indexers"},"flaresolverrPanel":{"intro":"FlareSolverr lets you access indexers whose site shows a Cloudflare challenge (« Checking your browser »).","configureBackend":"The FlareSolverr URL is set on the server (FLARESOLVERR_URL environment variable, e.g. in Docker/CasaOS).","perIndexer":"For each affected « custom » indexer, check « Use FlareSolverr » in the indexer add/edit form.","statusConfigured":"FlareSolverr is configured on this server.","statusNotConfigured":"FlareSolverr is not configured on this server. Set FLARESOLVERR_URL (e.g. http://flaresolverr:9191) to enable it.","testConnectivity":"Connectivity test","testChecking":"Checking…","testOperational":"FlareSolverr is operational and reachable.","testUnreachable":"FlareSolverr is not responding or unreachable.","docLink":"Documentation (CasaOS / Docker)","openUrlLabel":"URL to open FlareSolverr page","openUrlPlaceholder":"e.g. http://localhost:9191","save":"Save","saveSuccess":"Saved.","saveError":"Error saving.","openPage":"Open FlareSolverr page"},"syncCategories":{"title":"Sync categories","description":"Films, series, genres per indexer","selectorDescription":"Select the categories you want to sync for this indexer"},"indexerDefinitions":{"title":"Indexer definitions","subtitle":"Manage shared indexer definitions (country, language). Create, edit and delete according to your permissions."},"sync":{"title":"Torrent sync","description":"Manage automatic torrent synchronization from indexers"},"diagnostics":{"title":"Diagnostics","description":"Test backend connectivity, version and indexers"},"storage":{"title":"Storage","description":"Disk space used and plan limit"},"librqbit":{"title":"Torrent client","description":"Configure and monitor the integrated torrent client"},"librqbitWeb":{"title":"librqbit Web","description":"Open the torrent client web interface in a new tab"},"mediaPaths":{"title":"Media folders","description":"Set download folders by type (movies, series)"},"mediaPathsPanel":{"intro":"Choose the folder where downloads are saved for each type. Paths are relative to the server root.","filmsPath":"Movies folder","seriesPath":"Series folder","browse":"Browse","chooseFolder":"Choose this folder","loading":"Loading…","saveSuccess":"Paths saved (backend and cloud).","saveError":"Error saving.","browseTitle":"Select a folder","noSubfolders":"No subfolders."},"librarySources":{"title":"External folders","description":"Add folders outside the server (e.g. another NAS) to include in the library"},"libraryMedia":{"title":"Library media","description":"View media count, edit paths or remove an entry from the database"},"libraryMediaPanel":{"intro":"List of files indexed in the library (movies and episodes). You can fix a path if the file was moved or remove an entry from the index (the file on disk is not deleted).","loading":"Loading…","totalCount":"{count} entry/entries in database","filmsCount":"Movies: {count}","seriesCount":"Series (files): {count}","localCount":"Local: {count}","externalCount":"External: {count}","filter":"Filter","filterType":"Type","filterSource":"Source","sourceLocal":"Local source (download folder)","sourceExternal":"External libraries","noMedia":"No media indexed for this filter.","colTitle":"Title / File","colPath":"Path","colCategory":"Type","colSource":"Source","colActions":"Actions","editPath":"Edit path","removeFromLibrary":"Remove from library","removeFromLibraryConfirm":"Remove this entry from the library? The file on disk will not be deleted.","removeFromLibrarySuccess":"Entry removed from library.","deleteFileAndLibrary":"Delete file","deleteFileConfirm":"Delete the file from disk and remove from library? This action cannot be undone. (Local download folder only.)","deleteFileSuccess":"File deleted and entry removed from library.","deleteFileError":"Could not delete file (local folder only).","updateSuccess":"Path updated.","updateError":"Could not update path.","deleteConfirm":"Remove this entry from the library? The file on disk will not be deleted.","deleteSuccess":"Entry removed from library.","deleteError":"Could not remove entry."},"librarySourcesPanel":{"intro":"Add folders containing movies or series (e.g. on another NAS). After validation, a scan and TMDB enrichment will run.","pathPlaceholder":"e.g. \\\\\\\\zimacube.local\\\\Movies or smb://zimacube.local/Movies","browse":"Browse folder tree","browseTitle":"Choose a local folder","chooseCurrentFolder":"Use this folder","noFolders":"No subfolders available here.","browseError":"Could not load this folder tree.","pathFormatTitle":"Which format to use?","pathFormatWindows":"Windows (Explorer): open the folder in Explorer, then copy the path from the address bar → \\\\\\\\computer\\\\share\\\\folder","pathFormatMac":"macOS (Finder): Go → Connect to Server, enter the server address → smb://computer/share/folder","pathFormatNote":"The path must be accessible from the machine running the server (on Linux, use the mount point, e.g. /mnt/nas/Movies).","category":"Content type","categoryFilm":"Movies","categorySeries":"Series","labelOptional":"Library name (optional)","shareWithFriends":"Share with friends","addSource":"Add folder","editSource":"Edit source","saveSource":"Save changes","scan":"Run scan","syncing":"Syncing…","synchronized":"Synchronized","delete":"Delete","loading":"Loading…","addSuccess":"Folder added. Scan running in background.","addError":"Could not add folder.","updateSuccess":"Source updated.","updateError":"Could not update source.","scanStarted":"Scan started.","deleteSuccess":"Source removed.","enabled":"Enabled","disabled":"Disabled","enableSource":"Enable this source","disableSource":"Disable this source","enabledSuccess":"Source enabled.","disabledSuccess":"Source disabled.","noSources":"No external folders. Add a path (movies or series) to include it in the library.","stats":"{mediaCount} media, {folderCount} folders"},"versions":{"title":"Versions","description":"Client, backend and updates"},"account":{"title":"My Account","description":"View and manage your user account information"},"feedback":{"title":"Feedback","description":"Send your feedback and follow team responses"},"friends":{"title":"Friends","description":"Manage your friends, sharing and activity"},"localUsers":{"title":"Local users","description":"Manage local accounts with limited permissions","inviteTitle":"Invite a local user","inviteDescription":"Invite users to create a local account with limited permissions.","sendInvitation":"Send invitation","inviting":"Sending…","listTitle":"Local users ({count})","noLocalUsers":"No local users yet","emailRequired":"Email *","displayNameOptional":"Display name (optional)","emailPlaceholder":"user@example.com","displayNamePlaceholder":"John Doe","active":"Active","pending":"Pending","emailNotVerified":"Email not verified","createdOn":"Created on {date}","resendInvitation":"Resend invitation","delete":"Delete","deleteConfirm":"Are you sure you want to remove user {email}?","mainAccountOnly":"This page is for the main account only. Please sign in with your cloud account.","inviteSuccess":"Invitation sent successfully","inviteError":"Failed to send invitation","resendSuccess":"Invitation resent successfully","resendError":"Failed to resend invitation","deleteSuccess":"User removed successfully","deleteError":"Failed to remove user","loadError":"Failed to load local users. Please sign in again with your main account.","noToken":"No cloud token. Please sign in with your main account.","tokenExpired":"Session expired. Please sign in again with your main account."},"documentation":{"title":"Documentation","description":"User guide and help (opens on the website)"},"subscription":{"title":"Subscription(s)","description":"View your subscription and option status","notConnected":"Sign in to your cloud account to see your subscriptions.","connectToCloud":"Sign in on the website","plan":"Storage subscription","planName":"Plan","status":"Status","storage":"Cloud storage","periodEnd":"Period end","noStoragePlan":"No active storage subscription.","streamingTorrentOption":"Streaming torrent option","streamingTorrentActive":"Active: you can stream a torrent without downloading it fully.","streamingTorrentInactive":"Inactive. Managed on the website (cloud account).","manageOnWeb":"Manage my account on the website"},"quickLinks":"Quick links"}');
const serverSettings = { "title": "Server Configuration", "backendUrl": "Rust Backend URL", "backendUrlPlaceholder": "http://127.0.0.1:3000", "examples": "Examples: http://127.0.0.1:3000 (local) or http://192.168.1.100:3000 (local network)", "storageInfo": "This URL is stored in localStorage and used by the Astro client API routes to proxy to the Rust backend. The Rust backend uses port 3000 by default.", "testConnection": "Test connection", "testAndSave": "Test and Save", "reset": "Reset", "testing": "Testing...", "saving": "Saving...", "loadingConfig": "Loading configuration...", "currentUrl": "Current Rust backend URL:", "urlStoredInfo": "This URL is stored in localStorage and used by the client API routes.", "enterUrl": "Please enter a URL", "invalidUrl": "Invalid URL. Expected format: http://ip:port or https://domain.com", "protocolError": "Protocol must be http:// or https://", "connectionSuccess": "Connection successful! The Rust backend is accessible.", "connectionError": "Unable to connect to Rust backend ({status}). Check that the URL is correct and that the Rust backend is running.", "savedSuccess": "Configuration saved successfully to localStorage!", "savedMixedContent": "URL saved. Test skipped because the page is HTTPS and the backend is HTTP (Mixed Content).", "resetSuccess": "Configuration reset to default value.", "mixedContentError": "The page is HTTPS and the backend is HTTP. The browser blocks this test (Mixed Content). Use an HTTPS backend or a reverse proxy.", "clientUrlLabel": "Client URL (webOS / quick connect)", "clientUrlPlaceholder": "e.g. http://192.168.1.100:4321", "clientUrlHelp": "Optional. URL where this client is reachable (for webOS TV and quick-connect QR). If empty, the current address is used when saving.", "info": { "title": "Information", "point1": "The Rust backend URL is stored in localStorage (client-side)", "point2": "This URL is used by the Astro client API routes to proxy to the Rust backend", "point3": "Make sure the Rust backend is running and accessible at this URL", "point4": "The Rust backend uses port 3000 by default (configurable via BACKEND_PORT)" } };
const indexerDefinitionsManager = { "title": "Indexer definitions", "manageDefinitions": "Manage indexer definitions", "addDefinition": "Add definition", "noDefinitions": "No definitions available", "definitionsCount": "{count} definition(s)", "country": "Country", "language": "Language", "protocol": "Protocol", "connectionType": "Connection type", "type": { "public": "Public", "semiPrivate": "Semi-private", "private": "Private" }, "table": { "id": "ID", "name": "Name", "creator": "Creator", "actions": "Actions" }, "creator": { "system": "System" }, "form": { "idLabel": "ID (unique identifier)", "idPlaceholder": "e.g. my-indexer", "nameLabel": "Name", "namePlaceholder": "Display name", "versionLabel": "Version", "descriptionLabel": "Description", "descriptionPlaceholder": "Optional description", "searchEndpointLabel": "Search endpoint", "searchEndpointPlaceholder": "/api/...", "httpMethodLabel": "HTTP method", "countryPlaceholder": "e.g. FR, US", "languagePlaceholder": "e.g. fr, en", "requiresApiKey": "API key required", "requiresAuth": "Authentication required", "searchParams": "searchParams (JSON)", "responseMapping": "responseMapping (JSON)", "categoryMapping": "categoryMapping (JSON)", "ui": "ui (JSON)", "advanced": "Advanced", "downloadUrlTemplate": "Download URL template", "downloadUrlTemplateHelp": "Template for the download URL. Use {baseUrl}, {id}, {apiKey} as placeholders." }, "confirmDeleteDefinition": "Delete this indexer definition?", "errorLoad": "Error loading definitions", "errorCreate": "Error creating definition", "errorUpdate": "Error updating definition", "errorDelete": "Error deleting definition", "createdByYou": "Created by you", "loginRequired": "Cloud login required to create or edit definitions.", "searchPlaceholder": "Search by id or name…", "noResultsSearch": "No definition matches your search." };
const indexersManager = { "title": "Indexers", "addIndexer": "Add indexer", "editIndexer": "Edit indexer", "noIndexers": "No indexers configured", "confirmDelete": "Are you sure you want to delete this indexer?", "loading": "Loading...", "selectIndexer": "Select indexer", "cancel": "Cancel", "noDefinitions": "No indexer definitions available", "searchPlaceholder": "Search by name or description…", "filterByLanguage": "Language", "filterByCountry": "Country", "filterAll": "All", "noResultsForSearch": "No indexer matches your search or filters.", "select": "Select", "basedOn": "Based on", "required": "Required", "optional": "Optional", "apiKeyRequired": "API key required", "authRequired": "Authentication required", "useJackettLabel": "Use Jackett (optional)", "useJackettDescription": "Show indexers that use Jackett. When off, only built-in indexers (direct connection, no third-party app) are listed.", "errorLoading": "Error loading indexers", "errorSaving": "Error saving", "errorDeleting": "Error deleting", "errorTesting": "Error testing connection", "syncStarted": "Synchronization started. Results will appear shortly.", "cookieWizard": { "title": "Get session cookie", "tabSimple": "Simple method (extension)", "tabManual": "Step-by-step (F12)", "simpleIntro": "Use a browser extension to copy the cookie (including HttpOnly). Cookie-Editor is free and open source.", "simpleStep1": "Install the Cookie-Editor extension: Chrome or Firefox (see links below).", "simpleStep2": "Open the tracker site in a tab and log in (complete reCAPTCHA if shown).", "simpleStep3": 'Click the Cookie-Editor icon in the browser bar. Find the session cookie (often named after the site or "session"), click the copy icon next to its value.', "simpleStep4": 'Return to Popcornn and paste (Ctrl+V) into the "Cookie (session)" field, or use the drop zone below.', "extensionName": "Cookie-Editor", "extensionChrome": "Install for Chrome", "extensionFirefox": "Install for Firefox", "extensionNote": "Other extensions (e.g. EditThisCookie) work too. The key is being able to copy the session cookie value from the logged-in tracker page.", "manualIntro": "If you prefer to get the cookie manually (Developer Tools), follow the steps below. Screenshots can be added later.", "manualStep1Title": "Open the tracker site", "manualStep1Text": "Open the tracker URL (same as the indexer base URL) in your browser. Log in with your account if needed (and complete reCAPTCHA if it appears).", "manualStep2Title": "Open Developer Tools", "manualStep2Text": "Press F12 (or right-click → Inspect). Go to the Application tab (Chrome/Edge) or Storage (Firefox), then Cookies and select the tracker site.", "manualStep3Title": "Copy the cookie", "manualStep3Text": 'Find the session cookie (often named after the site or "session"). Right-click the value → Copy, or double-click to select and copy (Ctrl+C). You can also copy the full Cookie line if your browser shows it.', "manualStep4Title": "Paste in Popcornn", "manualStep4Text": 'Return to Popcornn, in the indexer form, and paste (Ctrl+V) into the "Cookie (session)" field. Save. The cookie expires after a while; if search fails later, repeat these steps and update the field.', "screenshotPlaceholder": "Screenshot to be added" }, "form": { "name": "Name", "baseUrl": "Base URL", "apiKey": "API Key", "username": "Username", "password": "Password", "cookie": "Cookie (session)", "cookiePlaceholder": "Paste the session cookie value here", "cookieDropZone": "Drop cookie here or paste (Ctrl+V)", "cookiePasteButton": "Paste from clipboard", "cookieHelp": 'This indexer uses cookie-based login. To get it: (1) Open the indexer site in your browser and log in (complete reCAPTCHA if shown). (2) Open Developer Tools (F12) → Application (or Storage) tab → Cookies → select the site. (3) Find the session cookie (often the site name or "session") and copy its full value. (4) Paste it here. The cookie expires after a while; if search starts failing, log in again on the site and update this field.', "cookieWizardOpen": "Guide: how to get the cookie", "jackettName": "Indexer ID (optional)", "useFlareSolverr": "Use FlareSolverr (Cloudflare)", "useFlareSolverrHelp": "Recommended if the site shows a Cloudflare challenge. Backend must have FLARESOLVERR_URL configured.", "enable": "Enable", "default": "Default", "priority": "Priority" }, "saving": "Saving..." };
const indexerCard = { "active": "Active", "inactive": "Inactive", "default": "Default", "priority": "Priority", "syncButton": "Sync", "syncing": "Syncing…", "testSuccess": "Test passed", "testFailed": "Test failed", "connectionSuccess": "Connection successful", "connectionError": "Connection error", "apiKeyTest": "API key / passkey", "firstTested": "tested first", "torrentsFoundTotal": "torrent(s) found in total", "categoriesReturned": "Categories returned:", "films": "Movies", "series": "TV series", "queriesSuccessOutOf": "query(s) successful out of", "failedQueries": "Failed queries:", "downloadFormatsAvailable": "Available download formats (Torznab 1.3):", "magnetAvailable": "Magnet link available", "torrentFileAvailable": ".torrent file available", "resultsWithMagnet": "result(s) with magnet link out of", "resultsWithTorrentFile": "result(s) with .torrent file out of", "tested": "tested", "torznabLinkOrder": "According to Torznab 1.3: links are retrieved in order", "exampleResults": "Sample results:", "noTmdbId": "No TMDB ID", "guidTorznab": "Torznab GUID (for API download)", "guidUsedForDownload": "GUID is used with the Torznab API to download the .torrent file", "downloadFormatTorznab": "Download format (Torznab):", "magnetLinkEnclosure": "Magnet link (magneturl/enclosure)", "magnetLink": "Magnet link", "torrentFile": ".torrent file", "noLinkAvailable": "No link available", "downloadTestTorrentFile": ".torrent file download test", "guidUsed": "GUID used:", "detailsTorznab": "Torznab details (enclosure/link/guid)", "magnetUri": "Magnet URI (magneturl/enclosure)", "downloadLink": "Download link", "torznabSourceOrder": "(Torznab 1.3: enclosure → link → guid)", "torznabSource": 'Torznab source: may come from <enclosure url="...">, <link> or <guid>', "downloadUrlAlternative": "Download URL (alternative)", "noDownloadLinkInResults": "No download link in test results", "torrentsFoundTest": "torrent(s) found during test", "exampleResult": "Sample result:", "size": "Size:", "testing": "Testing...", "testButton": "Test", "edit": "Edit", "delete": "Delete", "seeders": "seeders", "peers": "peers" };
const indexerTestModal = { "title": "Test indexer {name}", "testing": "Testing...", "progressLog": "Progress", "waitingFirstResult": "Waiting for first results...", "close": "Close" };
const setupIndexersStep = { "selectDefinitionTitle": "Choose an indexer definition", "manualHint": "If your indexer is not in the list, you can configure it manually.", "noDefinitions": "No definitions available", "configureManually": "Configure manually", "apiKeyRequired": "API key required", "select": "Select", "addIndexer": "Add indexer", "addDefinition": "Add an indexer definition", "basedOnDefinition": "Based on definition:", "searchPlaceholder": "Search by name or description…", "filterByLanguage": "Language", "filterByCountry": "Country", "filterAll": "All", "suggestedForYourLanguage": "Suggested for your language", "noResultsForSearch": "No indexer matches your search or filters." };
const indexerDefinitionDocs = { "open": "Documentation", "title": "Documentation — indexer definition", "intro": "This documentation explains how to fill every field of an indexer definition.\n\nTip: if unsure, start from an existing indexer and adjust only the endpoint + mappings.", "sections": { "basics": "Basic fields", "request": "Request (search)", "mappings": "Mappings (response / categories / UI)", "options": "Options", "examples": "Example (Torznab / Jackett / Prowlarr)", "commonMistakes": "Common mistakes" }, "fields": { "id": 'Stable unique identifier. Used as indexerTypeId on the client. Recommended: lowercase, digits, hyphens.\nExample: "ygg-torznab"', "name": 'Display name shown to users.\nExample: "YggTorrent"', "version": 'Definition version (useful to track changes).\nExample: "1.0.0"', "description": 'Optional description (shown in the list).\nExample: "FR indexer via Torznab"', "protocol": 'Protocol/type. "torznab" is the most common (Jackett/Prowlarr). Use "rest" / "newznab" / "custom" depending on your API.', "country": 'Indexer country (ISO-2 recommended).\nExample: "FR"', "language": 'Main language (ISO-639-1 recommended).\nExample: "fr"', "searchEndpoint": 'Path (or absolute URL) called to perform a search.\nYou can use a "{indexer}" placeholder if required by your endpoint.\nExample: "/api/v2.0/indexers/{indexer}/results/torznab"', "searchMethod": "HTTP method used by the endpoint (GET or POST).", "searchParams": "JSON of parameters to send. For Torznab: often empty here because the query is built by the indexer.\nYou can set static params if your endpoint needs them.", "responseMapping": "JSON mapping from API response fields to expected fields (title, id/guid, size, seeders, leechers, link, uploaded_at...).\nValues represent the key name in the response.", "categoryMapping": "JSON mapping from category -> indexer category code(s).\nExample: films=2000, series=5000 (Torznab).", "ui": "Optional UI metadata (icon, color, custom fields). Used to display the indexer nicely in the client.", "requiresApiKey": "If checked: the UI should treat the API key as required when configuring the indexer.", "requiresAuth": "If checked: the indexer requires authentication (in addition to / instead of an API key)." }, "examples": { "torznabIntro": "Typical setup (Torznab via Jackett/Prowlarr). Users will then provide baseUrl + API key when configuring the indexer.", "torznabSnippet": 'protocol: torznab\nsearchEndpoint: /api/v2.0/indexers/{indexer}/results/torznab\nsearchMethod: GET\ncountry: FR\nlanguage: fr\ncategoryMapping: { "films": "2000", "series": "5000" }\nresponseMapping: { "results": "Results", "title": "Title", "id": "Guid", "size": "Size", "seeders": "Seeders", "leechers": "Peers", "uploaded_at": "PublishDate", "link": "Link" }', "note": "Note: depending on your backend/proxy, baseUrl is provided by the user when configuring the indexer (not in the definition)." }, "mistakes": { "endpoint": 'Endpoint: make sure it starts with "/" (if relative) and matches the target API.', "json": "JSON: watch commas, quotes and braces. Invalid JSON will make create/update fail.", "mapping": "Mapping: if a field is incorrectly mapped (e.g. id/title), results may be empty or incomplete.", "countryLanguage": "Country/Language: fill them to allow filtering and avoid ambiguous definitions." } };
const loginForm = { "title": "Login", "emailPassword": "Email / Password", "quickConnect": "Quick Connect", "email": "Email", "emailPlaceholder": "your@email.com", "password": "Password", "passwordPlaceholder": "Your password", "submit": "Sign in", "submitting": "Signing in...", "noAccount": "No account?", "register": "Register", "errors": { "dbNotConfigured": "The server does not have a configured database. Please contact the server administrator.", "invalidCredentials": "Invalid email or password", "serverError": "Server error. The server may not be properly configured.", "networkError": "Connection error. Check your network connection and the server URL in settings." } };
const registerForm = { "title": "Register", "email": "Email", "emailPlaceholder": "your@email.com", "password": "Password", "passwordPlaceholder": "Choose a password", "confirmPassword": "Confirm password", "confirmPasswordPlaceholder": "Confirm your password", "submit": "Register", "submitting": "Registering...", "hasAccount": "Already have an account?", "login": "Sign in" };
const errorPage = { "back": "Back", "home": "Home" };
const legacySettings = { "serverConfig": "Server configuration", "serverConfigDesc": "Configure the Popcornn server URL to connect to", "serverUrl": "Server URL", "serverUrlExample": "Example: http://192.168.1.100:4321 or https://popcorn.example.com", "urlRequired": "Server URL required", "invalidUrl": "Invalid URL", "configSaved": "Configuration saved!", "preferences": "Preferences", "darkTheme": "Dark theme", "autoplay": "Autoplay", "info": "Information", "version": "Version", "type": "Type", "lightClient": "Light client", "infoDescription": "This application is a light client. All business logic (torrents, indexers, streaming) is handled by the remote server.", "legalInfo": "Legal information", "readDisclaimer": "Read the disclaimer and terms of use →", "disclaimerImportant": "Important: Please read the disclaimer carefully before using this application." };
const header = { "home": "Home", "features": "Features", "documentation": "Documentation", "search": "Search", "library": "Library", "settings": "Settings", "dashboard": "Dashboard", "logout": "Logout", "login": "Login", "register": "Sign up" };
const pageHeader = { "back": "Back" };
const sync = { "inProgress": "Synchronization in progress", "syncInProgress": "Synchronization in progress", "syncPending": "Synchronization pending...", "syncStarting": "Starting synchronization...", "syncComplete": "Synchronization complete", "syncCompleted": "Synchronization completed", "syncDescription": "Content is being synchronized from your indexers.", "filmsSyncDescription": "Films are being synchronized from your indexers.", "seriesSyncDescription": "Series are being synchronized from your indexers.", "noFilmsSynced": "No films synchronized", "noSeriesSynced": "No series synchronized", "noTorrentsSynced": "No torrents synchronized", "startSyncDescription": "Start by synchronizing your indexers to discover your films.", "startSyncSeriesDescription": "Start by synchronizing your indexers to discover your series.", "startSyncAllDescription": "Start by synchronizing your indexers to discover your content.", "starting": "Starting...", "startSync": "Start synchronization", "configureIndexers": "Configure indexers", "goToSyncSettings": "Go to synchronization settings →", "configureTmdbKey": "Configure TMDB key", "syncInfo": "Synchronization retrieves torrents from your configured indexers and enriches them with TMDB metadata.", "noIndexerActivated": "No indexer activated. Please configure at least one indexer in settings.", "tmdbTokenMissing": "TMDB token missing. Please configure your TMDB token in settings.", "noFilmsAvailable": "No films available", "noFilmsAvailableDescription": "No films are available at the moment.", "noSeriesAvailable": "No series available", "noSeriesAvailableDescription": "No series are available at the moment.", "checkConsole": "Check the console for more details.", "allFilms": "All films", "allSeries": "All series", "syncStartingBackend": "Starting synchronization...", "backendConnecting": "Connecting to backend. The backend may take a few seconds to start.", "fetchingTorrents": "Fetching torrents (before insertion)", "torrentsFetched": "torrent(s) fetched", "pages": "page(s)", "currentIndexer": "Current indexer", "torrents": "torrents", "category": "Category", "processingTorrents": "Processing torrents", "globalProgress": "Global progress", "torrentsSynced": "torrents synchronized", "totalSynced": "Total synchronized", "noTorrentsFound": "No torrents found at the moment. Synchronization continues.", "waitForSync": "Please wait during synchronization. You can continue once it's finished.", "syncFromIndexers": "Synchronizing torrents from indexers...", "syncFirstTime": "Launch the first synchronization to retrieve torrents from your configured indexers.", "syncWillQuery": "Synchronization will query your enabled indexers to retrieve available torrents.", "syncMayTakeTime": "This operation may take several minutes depending on the number of indexers and torrents.", "torrentsOrganized": "Torrents will be organized by category (films, series)", "tmdbMetadataAuto": "TMDB metadata will be added automatically if configured", "canRelaunchSync": "You can relaunch a synchronization from settings later", "previous": "Previous", "launchSync": "Launch synchronization", "torrentsSyncedSuccess": "Torrents have been successfully synchronized from your indexers.", "canContinueToFinal": "You can now continue to the final step to access the dashboard.", "continue": "Continue", "accessDashboardNow": "Access dashboard now", "canWaitOrAccess": "You can wait for synchronization to finish or access the dashboard directly.", "checkingSyncStatus": "Checking synchronization status...", "syncTorrentsInProgress": "Synchronizing torrents in progress...", "canStartUsing": "You can now start using Popcornn to search and watch your favorite content.", "browserNoVideo": "Your browser does not support video playback." };
const syncProgress = { "starting": "Starting synchronization...", "backendConnecting": "Connecting to backend. The backend may take a few seconds to start.", "inProgress": "Synchronization in progress", "pending": "Synchronization pending...", "fetching": "Fetching torrents (before insertion)", "torrentsFetched": "torrent(s) fetched", "pages": "page(s)", "currentIndexer": "Current indexer", "torrents": "torrents", "category": "Category", "processing": "Processing torrents", "globalProgress": "Global progress", "torrentsSynced": "torrents synchronized", "totalSynced": "Total synchronized", "noTorrentsFound": "No torrents found at the moment. Synchronization continues." };
const completeStep = { "configurationComplete": "Configuration complete!", "clientReady": "Your Popcornn client is now configured and ready to use.", "checkingStatus": "Checking synchronization status...", "syncInProgress": "Synchronizing torrents in progress...", "waitOrAccess": "You can wait for synchronization to finish or access the dashboard directly.", "syncComplete": "Synchronization complete", "canStartUsing": "You can now start using Popcornn to search and watch your favorite content.", "browserNoVideo": "Your browser does not support video playback.", "accessDashboardNow": "Access dashboard now" };
const syncStep = { "syncTorrents": "Synchronize torrents", "launchFirstSync": "Launch the first synchronization to retrieve torrents from your configured indexers.", "syncWillQuery": "Synchronization will query your enabled indexers to retrieve available torrents.", "mayTakeTime": "This operation may take several minutes depending on the number of indexers and torrents.", "torrentsOrganized": "Torrents will be organized by category (films, series)", "tmdbAuto": "TMDB metadata will be added automatically if configured", "canRelaunch": "You can relaunch a synchronization from settings later", "previous": "Previous", "starting": "Starting...", "launchSync": "Launch synchronization", "inProgress": "Synchronization in progress", "fromIndexers": "Synchronizing torrents from indexers...", "pleaseWait": "Please wait during synchronization. You can continue once it's finished.", "completed": "Synchronization completed!", "syncedSuccess": "Torrents have been successfully synchronized from your indexers.", "continueToFinal": "You can now continue to the final step to access the dashboard.", "continue": "Continue" };
const settingsPages = { "indexers": { "title": "Indexers", "subtitle": "Configure TMDB and your indexers for search" }, "indexerDefinitions": { "title": "Indexer definitions", "subtitle": "Manage shared definitions (country, language, endpoints, mappings)." }, "sync": { "title": "Synchronization", "subtitle": "Manage automatic torrent synchronization", "configureIndexers": "Configure indexers" }, "favorites": { "title": "Watch later", "subtitle": "Media you added to favorites. Synced with your cloud account.", "empty": "No media in the list. Add films or series from their detail page.", "open": "View" }, "debugSync": { "pageTitle": "Debug Sync (provisional)", "pageSubtitle": "Test whether a torrent is actually downloadable (GET + Range, bencode).", "title": "Downloadability check", "subtitle": "Indexer + torrent ID: backend tests the download URL (GET Range 0-63, first byte 'd').", "indexerId": "Indexer", "torrentId": "Torrent ID", "torrentIdPlaceholder": "e.g. info_hash or id depending on indexer", "loadingIndexers": "Loading…", "check": "Check", "checking": "Checking…", "fillBoth": "Enter indexer and torrent ID.", "errorGeneric": "Error during check.", "downloadable": "Downloadable", "notDownloadable": "Not downloadable", "debugLink": "Debug (provisional)" }, "diagnostics": { "title": "Diagnostics", "healthTitle": "Backend status", "healthSubtitle": "Checks availability, latency and version", "check": "Test", "checking": "Testing...", "backendReachable": "Backend reachable", "backendUnreachable": "Backend unavailable", "latency": "Latency", "version": "Version", "downloadDir": "Download directory", "ffmpeg": "FFmpeg", "torrentClient": "Torrent client", "librqbitVersion": "librqbit version", "unknown": "Unavailable", "ok": "OK", "ko": "KO", "ffmpegHint": "FFmpeg: check server logs if HLS fails", "errorGeneric": "Unable to retrieve backend status" }, "storage": { "title": "Storage", "subtitle": "Disk space used by downloads (and limit if plan)", "used": "Used", "available": "Free space", "refresh": "Refresh", "checking": "Loading...", "errorGeneric": "Unable to retrieve storage statistics", "retentionLabel": "Keep media for", "retentionDays": "{days} days", "retentionDontKeep": "Don't keep (remove after playback)", "retentionDisabled": "Disabled" }, "friends": { "title": "Friends", "subtitle": "Invite friends, configure sharing and view activity.", "librariesSharedExplanation": "The libraries (movies, series) you share will be visible to your friends. For each friend, choose what to share: nothing, everything, or a selection." }, "account": { "title": "My account", "subtitle": "Manage your profile (avatar/name) and view your information" }, "feedback": { "title": "Feedback", "subtitle": "Send your feedback and follow team responses" }, "server": { "title": "Server", "subtitle": "Configure the Popcornn server URL to connect to" }, "quickConnect": { "title": "Quick connect", "description": "Scan the QR code or enter the code to connect a new device to your account.", "codeLabel": "Code", "qrAlt": "Quick connect QR code", "scanHint": "Scan with the app or open the link on a device already signed in to your account.", "expiresIn": "Expires in", "waitingAuth": "Waiting for authorization…", "authorized": "Authorized", "connectedSuccess": "Device connected successfully.", "regenerateCode": "Regenerate code", "initError": "Unable to start quick connect.", "codeExpired": "This code has expired. Generate a new one.", "connectError": "Error connecting the device." }, "librqbit": { "title": "Torrent client", "subtitle": "Configure and monitor the integrated torrent client", "openInNewTab": "Open in new tab", "sessionStats": "Current activity", "limits": "Rate limits", "limitsUploadLabel": "Upload (bps)", "limitsDownloadLabel": "Download (bps)", "limitsOptional": "optional", "limitsHint": "Leave empty for unlimited", "logs": "Logs", "viewLogs": "View logs", "logsConnecting": "Connecting to stream…", "logsEmpty": "No logs", "logsClose": "Close", "webUiDescription": "Full Web UI: torrent list, magnet add, statistics.", "webUiCta": "Open Web interface", "dht": "DHT Network", "dhtStats": "DHT Stats", "dhtTable": "DHT Table", "rustLog": "Log level", "rustLogPlaceholder": "info", "rustLogHint": "E.g. info, debug, warn. Backend restart required to take effect.", "uptime": "Uptime", "uptimeMinutes": "{min} min", "loading": "Loading…", "errorLoadSession": "Unable to load session stats.", "errorInvalidValues": "Invalid numeric values.", "errorNoStream": "No stream" } };
const friendsManager = { "pageReservedForMainAccount": "This page is reserved for the main account.", "pageReservedForMainAccountLong": "This page is reserved for the main account. Please sign in with your cloud account.", "errorLoading": "Error loading", "pleaseEnterEmail": "Please enter an email", "errorInvitation": "Error sending invitation", "friendAdded": "Friend added", "confirmDeleteFriend": "Are you sure you want to remove this friend?", "confirmDeleteFriendWithEmail": "Are you sure you want to remove this friend ({email})?", "errorDelete": "Error deleting", "friendRemoved": "Friend removed", "errorUpdateShare": "Error updating share", "shareUpdated": "Share updated", "errorUpdate": "Error updating", "errorLoadLibrary": "Unable to load library", "title": "Friends", "subtitle": "Invite friends, configure sharing and view activity.", "inviteFriend": "Invite a friend", "emailRequired": "Email *", "emailPlaceholder": "friend@example.com", "displayNameOptional": "Display name (optional)", "displayNamePlaceholder": "Alice", "sending": "Sending...", "sendInvitation": "Send invitation", "myFriends": "My friends", "refresh": "Refresh", "noFriends": "No friends yet.", "currentShare": "Current share", "viewShare": "View share", "shareType": "Share type", "shareNone": "None", "shareAll": "All", "shareSelected": "Selection", "selectMedia": "Select media", "mediaSelectedCount": "{count} media selected", "recentActivity": "Recent activity", "noActivity": "No activity.", "selectMediaToShare": "Select media to share", "noMediaSelectable": "No selectable media (ensure your library is enriched).", "apply": "Apply" };
const torrentSyncManager = { "status": "Status", "inactive": "Inactive", "refresh": "Refresh", "inProgress": "In progress...", "elapsedSince": "In progress since {time}", "elapsedSinceLabel": "In progress since", "syncInProgressShort": "Sync…", "lastSync": "Last sync: {date}", "neverSynced": "No synchronization performed", "synchronizationInProgress": "Synchronization in progress", "currentIndexer": "Current indexer", "category": "Category", "searchQuery": "Search query", "torrentProcessing": "Torrent processing", "afterFiltering": "After filtering and TMDB enrichment", "recentErrors": "Recent errors", "activeIndexers": "Active indexers", "progress": "Progress", "films": "Films", "series": "Series", "others": "Others", "distributionChart": "Distribution", "tmdb": "TMDB", "tmdbEnrichmentThisIndexer": "TMDB Enrichment (this indexer)", "withTmdb": "With TMDB ID", "withoutTmdb": "Without TMDB ID", "ofTorrents": "of torrents", "enriched": "enriched", "torrentsWithoutTmdb": "Torrents without TMDB ID", "displayingFirst": "(Displaying first 50)", "noneWithoutTmdb": "No torrents without TMDB ID found", "tipNoTmdb": "These torrents could not be enriched with TMDB metadata. Check that the TMDB API key is configured and restart a synchronization.", "improveWithGemini": "Improve with Gemini", "improveWithGeminiSuccess": "Enrichment rules updated. Restart a sync to apply.", "improveWithGeminiError": "Error calling Gemini.", "improveWithGeminiAdminOnly": "Cloud admin only.", "improveWithGeminiConfigError": "Service not configured (GEMINI_API_KEY on popcorn-web) or temporary error.", "allHaveTmdb": "All torrents have a TMDB ID and are enriched with metadata", "noTorrentsSynced": "No torrents synchronized", "noContentInDatabase": "No content in database", "lastSyncNoResults": "The last synchronization returned no results", "activeIndexersCount": "Active indexers ({count}):", "noIndexerActivated": "No indexer activated", "mustConfigureIndexer": "You must configure and enable at least one indexer to synchronize torrents.", "stopSync": "Stop synchronization", "stopping": "Stopping...", "launchSync": "Launch a synchronization", "launchSyncThisIndexer": "Launch sync (this indexer)", "clearTorrents": "Clear torrents", "clearing": "Clearing...", "downloadLog": "Download log", "downloadLogError": "Could not download synchronization log.", "settings": "Settings", "syncFrequency": "Automatic synchronization frequency", "currently": "Currently", "autoSyncEnabled": "Automatic synchronization enabled", "maxTorrentsPerCategory": "Maximum torrents per category", "maxTorrentsPerCategoryHint": "Maximum number of torrents per category (films, series). 0 = unlimited.", "advanced": "Advanced", "rssIncremental": "RSS Torznab (incremental) — catch up on new torrents between two syncs", "rssIncrementalNote": "Recommended if you use Torznab/Jackett. (Does not affect non-Torznab indexers)", "filmKeywords": "Synchronization keywords — Films (1 per line)", "filmKeywordsPlaceholder": "Ex: *\n2024\n2023\nnew\nrecent", "filmKeywordsNote": "Used as a complement if RSS is not available or insufficient. Leave empty to use default values (*, 2024, 2023, new, recent).", "seriesKeywords": "Synchronization keywords — Series (1 per line)", "seriesKeywordsPlaceholder": "Ex: *\n2024\n2023\nnew\nrecent", "seriesKeywordsNote": "Used as a complement if RSS is not available or insufficient. Leave empty to use default values (*, 2024, 2023, new, recent).", "settingsNotAvailable": "Synchronization settings are not available. Reload the page.", "confirmClearAll": "Are you sure you want to delete all synchronized torrents? This action is irreversible.", "stopSyncConfirm": "Stop synchronization", "stopSyncConfirmDesc": "Are you sure you want to stop the synchronization?", "settingsSaved": "Settings updated successfully", "errorUpdating": "Error updating settings", "syncStopped": "Synchronization stopped successfully", "syncStarted": "Synchronization started. Results will appear shortly.", "errorStopping": "Error stopping synchronization", "torrentsCleared": "{count} torrent(s) deleted successfully", "torrentsSynced": "Torrents synced", "totalSynced": "Total synced", "errorClearing": "Error deleting torrents", "never": "Never", "minutes": "minute(s)", "hours": "hour(s)", "days": "day(s)", "raw": "raw", "toProcess": "to process", "fetched": "fetched", "synchronized": "synchronized", "noTorrentsFound": "No torrents found", "syncInProgressNoResults": "Synchronization is in progress but no results have been returned yet.", "indexersQueried": "Indexers queried:", "noResultsAfter": "No results after {time}", "checkBackendLogs": "Check backend logs or test indexers individually.", "processingInProgress": "Processing in progress", "torrentsFetchedEnriching": "{count} torrent(s) fetched, enriching and inserting into database.", "bruts": "raw", "fetchedFromIndexers": "fetched (indexers)", "inDatabase": "in database", "fetchThenEnrich": "TMDB", "enrichingInProgress": "Enrichment in progress…", "phaseFetch": "Phase 1 — Fetching", "phaseFetchExplanation": "RSS pages are being fetched. No items in database yet: TMDB enrichment and insertion will start once fetching is complete.", "phaseEnrich": "Phase 2 — Enrichment and insertion", "phaseEnrichProgress": "{current} / {total} processed", "statsByIndexer": "By indexer", "syncIndexersTitle": "Indexers to sync", "allIndexers": "All indexers", "selectAtLeastOneIndexer": "Select at least one indexer to start synchronization.", "fullScan": "Launch full scan", "indexersSection": "Indexers", "indexerFetching": "Fetching…", "indexerEnriching": "Enriching…", "indexerDone": "Done", "indexerError": "Error", "newContentsFound": "{count} torrent(s) fetched", "newContentsFoundTooltip": "Raw torrents from the indexer. Films/Series count depends on TMDB matching (enrichment).", "filmsSeriesSynced": "{films} Films, {series} Series synced", "recentActivity": "Recent activity", "noSyncInProgress": "No synchronization in progress", "activityTitle": "What's happening", "syncTriggerManual": "Manual start (Scan button)", "syncTriggerScheduled": "Scheduled sync (automatic)", "activityLogTitle": "Latest log lines", "nextSyncIn": "Next sync scheduled in {minutes} min", "nextSyncDisabled": "Automatic sync disabled", "progressGlobal": "Overall progress", "connectionError": "Connection error", "lastErrors": "Last errors", "indexerDetails": "Indexer details", "close": "Close", "filmsCount": "Films", "seriesCount": "Series", "othersCount": "Others", "totalInDb": "Total in database", "sourceUrl": "Source URL", "clickForDetails": "Click to view details", "pageSummary": "Summary", "progressTitle": "Sync status", "filterAll": "All", "progressLabel": "Progress", "tabOverview": "Overview", "tabSettings": "Settings", "toolsAriaLabel": "Tools", "startBackendToSeeData": "Start the backend to see data.", "settingsAvailableWhenBackendConnected": "Settings available when backend is connected.", "custom": "custom", "tmdbEnrichmentPrefix": "TMDB enrichment: ", "clickIndexerCardAbove": "Click an indexer card above to see details and list." };
const backendDiagnostics = { "title": "Network Diagnostics (Android/Desktop)", "description": "Checks the endpoints used by the app in static build.", "backendConfigured": "Backend configured:", "openAudit": "Open Audit page (tests all communication methods)", "altIp": "Alternative IP to test", "willTestBoth": "Diagnostics will test both URLs: the configured one and this one.", "emulatorNote": "10.0.2.2 is the special Android emulator IP to access the host machine's localhost. Tests with this IP will fail if you are not on an Android emulator.", "runOnBoot": "Run this page automatically on startup", "runOnBootNote": "In practice: if enabled, the app redirects to /settings/diagnostics on launch.", "rerun": "Rerun", "testing": "Testing...", "test": "Test", "status": "Status", "duration": "Duration", "detail": "Detail", "loading": "Loading...", "report": "Report", "copy": "Copy", "copied": "Report copied to clipboard.", "copyFallback": "Report copied (fallback).", "copyManual": "Unable to copy automatically. Select the text and copy manually.", "reportTip": "Tip: paste this JSON into a message, it allows me to diagnose very quickly (DNS/LAN, cleartext, auth, endpoints)." };
const versionInfo = { "updateAvailable": "Update available", "updateBadge": "↑ v{version}", "updateAvailableClient": "A new client version is available (v{latest}). You are using v{current}.", "updateAvailableServer": "A new backend version is available (v{latest}). You are using v{current}.", "updateAvailableBoth": "New versions are available for client (v{clientLatest}) and backend (v{serverLatest}).", "dockerInstructions": "When using Docker, update from the host: docker compose pull && docker compose up -d", "checkingUpdates": "Checking for updates...", "hardResetTitle": "Hard Reset", "hardResetDescription": "Completely wipes the backend database and signs you out on this device.", "hardResetAction": "Hard Reset", "hardResetInProgress": "Resetting...", "hardResetConfirm": "Confirm Hard Reset? All backend data will be deleted.", "hardResetError": "Unable to perform hard reset." };
const enTranslations = {
  common,
  demo,
  ads,
  requests,
  requestsAdmin,
  feedback,
  backend,
  blacklist,
  discover,
  languages,
  wizard,
  account,
  interfaceSettings,
  playback,
  nav,
  settings,
  errors,
  permissions,
  dashboard,
  search,
  library,
  torrentStats,
  downloads,
  settingsMenu,
  serverSettings,
  indexerDefinitionsManager,
  indexersManager,
  indexerCard,
  indexerTestModal,
  setupIndexersStep,
  indexerDefinitionDocs,
  loginForm,
  registerForm,
  errorPage,
  legacySettings,
  header,
  pageHeader,
  sync,
  syncProgress,
  completeStep,
  syncStep,
  settingsPages,
  friendsManager,
  torrentSyncManager,
  backendDiagnostics,
  versionInfo
};
const translations = {
  fr: frTranslations,
  en: enTranslations
};
class I18nStore {
  constructor() {
    __publicField(this, "language", DEFAULT_LANGUAGE);
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "initialized", false);
    __publicField(this, "handleStorageChange", (e) => {
      if (e.key === "popcorn_client_user_preferences" && e.newValue) {
        try {
          const prefs = JSON.parse(e.newValue);
          if (prefs.language && AVAILABLE_LANGUAGES.includes(prefs.language) && prefs.language !== this.language) {
            this.language = prefs.language;
            this.notifyListeners();
          }
        } catch (e2) {
        }
      }
    });
    __publicField(this, "handleLanguageEvent", (e) => {
      if (e.detail.language && e.detail.language !== this.language) {
        this.language = e.detail.language;
        this.notifyListeners();
      }
    });
    if (typeof window !== "undefined") {
      this.init();
    }
  }
  init() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const stored = localStorage.getItem("popcorn_client_user_preferences");
      if (stored) {
        const prefs = JSON.parse(stored);
        if (prefs.language && AVAILABLE_LANGUAGES.includes(prefs.language)) {
          this.language = prefs.language;
        }
      }
    } catch (e) {
      console.warn("[i18n] Erreur lors de la lecture des préférences:", e);
    }
    document.documentElement.lang = this.language;
    window.addEventListener("storage", this.handleStorageChange);
    window.addEventListener("language-changed", this.handleLanguageEvent);
  }
  notifyListeners() {
    this.listeners.forEach((listener) => listener(this.language));
  }
  getLanguage() {
    return this.language;
  }
  setLanguage(lang) {
    if (!AVAILABLE_LANGUAGES.includes(lang)) {
      console.warn(`[i18n] Langue non supportée: ${lang}`);
      return;
    }
    if (lang === this.language) return;
    this.language = lang;
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("popcorn_client_user_preferences");
        const prefs = stored ? JSON.parse(stored) : {};
        prefs.language = lang;
        localStorage.setItem("popcorn_client_user_preferences", JSON.stringify(prefs));
        document.documentElement.lang = lang;
        window.dispatchEvent(new CustomEvent("language-changed", {
          detail: {
            language: lang
          }
        }));
      } catch (e) {
        console.warn("[i18n] Erreur lors de la sauvegarde de la langue:", e);
      }
    }
    this.notifyListeners();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /**
   * Récupère une valeur imbriquée dans un objet à partir d'une clé avec points
   */
  getNestedValue(obj, path) {
    const keys = path.split(".");
    let current = obj;
    for (const key of keys) {
      if (current === void 0 || current === null) {
        return void 0;
      }
      current = current[key];
    }
    return typeof current === "string" ? current : void 0;
  }
  /**
   * Remplace les paramètres dans une chaîne de traduction
   */
  interpolate(text, params) {
    if (!params) return text;
    return Object.entries(params).reduce((result, [key, value]) => {
      return result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
    }, text);
  }
  /**
   * Fonction de traduction
   */
  t(key, params) {
    const translation = this.getNestedValue(translations[this.language], key);
    if (translation === void 0) {
      const fallback = this.getNestedValue(translations[DEFAULT_LANGUAGE], key);
      if (fallback === void 0) {
        console.warn(`[i18n] Clé de traduction manquante: ${key}`);
        return key;
      }
      return this.interpolate(fallback, params);
    }
    return this.interpolate(translation, params);
  }
}
const i18nStore = new I18nStore();
function useI18n() {
  const [language, setLanguageState] = useState(i18nStore.getLanguage());
  useEffect(() => {
    const unsubscribe = i18nStore.subscribe((newLang) => {
      setLanguageState(newLang);
    });
    setLanguageState(i18nStore.getLanguage());
    return unsubscribe;
  }, []);
  const setLanguage = useCallback((lang) => {
    i18nStore.setLanguage(lang);
  }, []);
  const t = useCallback((key, params) => {
    return i18nStore.t(key, params);
  }, [language]);
  return {
    language,
    setLanguage,
    t,
    availableLanguages: AVAILABLE_LANGUAGES
  };
}
function ErrorPage({
  code,
  title,
  message,
  showHomeButton = true,
  showBackButton = true
}) {
  const {
    t
  } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const getErrorColors = () => {
    switch (code) {
      case 404:
        return {
          gradient: "from-blue-400 via-purple-400 to-pink-400",
          circles: "from-blue-500/10 via-purple-500/10 to-pink-500/10",
          border1: "border-blue-500/30",
          border2: "border-purple-500/30",
          text: "text-blue-400"
        };
      case 403:
        return {
          gradient: "from-yellow-400 via-orange-400 to-red-400",
          circles: "from-yellow-500/10 via-orange-500/10 to-red-500/10",
          border1: "border-yellow-500/30",
          border2: "border-orange-500/30",
          text: "text-yellow-400"
        };
      case 500:
      case 502:
      case 503:
        return {
          gradient: "from-red-400 via-pink-400 to-purple-400",
          circles: "from-red-500/10 via-pink-500/10 to-purple-500/10",
          border1: "border-red-500/30",
          border2: "border-pink-500/30",
          text: "text-red-400"
        };
      default:
        return {
          gradient: "from-gray-400 via-gray-500 to-gray-600",
          circles: "from-gray-500/10 via-gray-600/10 to-gray-700/10",
          border1: "border-gray-500/30",
          border2: "border-gray-600/30",
          text: "text-gray-400"
        };
    }
  };
  const colors = getErrorColors();
  return jsxs("div", {
    className: "min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center relative overflow-hidden",
    children: [jsxs("div", {
      className: "absolute inset-0 overflow-hidden",
      children: [jsx("div", {
        className: `absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),transparent_50%)] animate-pulse`
      }), jsx("div", {
        className: `absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r ${colors.circles} rounded-full blur-3xl animate-pulse`,
        style: {
          animationDelay: "0s",
          animationDuration: "3s"
        }
      }), jsx("div", {
        className: `absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r ${colors.circles} rounded-full blur-3xl animate-pulse`,
        style: {
          animationDelay: "1.5s",
          animationDuration: "3s"
        }
      })]
    }), jsxs("div", {
      className: `relative z-10 flex flex-col items-center justify-center space-y-8 px-4 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`,
      children: [jsx("div", {
        className: "relative",
        children: jsxs("div", {
          className: "w-32 h-32 md:w-40 md:h-40 relative",
          children: [jsx("div", {
            className: `absolute inset-0 border-4 ${colors.border1} rounded-full animate-spin`,
            style: {
              animationDuration: "3s"
            }
          }), jsx("div", {
            className: `absolute inset-2 border-4 ${colors.border2} rounded-full animate-spin`,
            style: {
              animationDuration: "2s",
              animationDirection: "reverse"
            }
          }), jsx("div", {
            className: "absolute inset-0 flex items-center justify-center",
            children: jsx("div", {
              className: `text-5xl md:text-7xl font-bold bg-gradient-to-r ${colors.gradient} bg-clip-text text-transparent`,
              children: code
            })
          })]
        })
      }), jsx("div", {
        className: "text-4xl md:text-6xl animate-bounce",
        style: {
          animationDuration: "2s"
        },
        children: "🍿"
      }), jsxs("div", {
        className: "text-center space-y-4 max-w-2xl",
        children: [jsx("h1", {
          className: `text-3xl md:text-5xl font-bold bg-gradient-to-r ${colors.gradient} bg-clip-text text-transparent animate-pulse`,
          children: title
        }), jsx("p", {
          className: "text-lg md:text-xl text-gray-300 font-medium",
          children: message
        })]
      }), jsxs("div", {
        className: "flex flex-col sm:flex-row gap-4 tv:gap-6 items-center",
        children: [showBackButton && jsxs("button", {
          onClick: () => window.history.back(),
          className: "px-8 py-4 tv:px-12 tv:py-5 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-bold text-lg tv:text-2xl rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 focus:scale-105 border-2 border-gray-600/50 hover:border-gray-500/50 focus:border-primary-500 flex items-center gap-2 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[56px] tv:min-h-[64px]",
          tabIndex: 0,
          "data-focusable": true,
          children: [jsx("span", {
            className: "text-2xl tv:text-3xl",
            children: "←"
          }), jsx("span", {
            children: t("errorPage.back")
          })]
        }), showHomeButton && jsx("a", {
          href: "/dashboard",
          className: "px-8 py-4 tv:px-12 tv:py-5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold text-lg tv:text-2xl rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 focus:scale-105 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[56px] tv:min-h-[64px]",
          tabIndex: 0,
          "data-focusable": true,
          children: t("errorPage.home")
        })]
      }), jsxs("div", {
        className: "flex space-x-2",
        children: [jsx("div", {
          className: `w-2 h-2 bg-gradient-to-r ${colors.gradient} rounded-full animate-bounce`,
          style: {
            animationDelay: "0s"
          }
        }), jsx("div", {
          className: `w-2 h-2 bg-gradient-to-r ${colors.gradient} rounded-full animate-bounce`,
          style: {
            animationDelay: "0.2s"
          }
        }), jsx("div", {
          className: `w-2 h-2 bg-gradient-to-r ${colors.gradient} rounded-full animate-bounce`,
          style: {
            animationDelay: "0.4s"
          }
        })]
      })]
    }), jsx("style", {
      children: `
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `
    })]
  });
}
const $$403 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="fr" data-theme="dark" class="overflow-hidden"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="Accès refusé - Popcorn Torrent"><link rel="icon" type="image/png" href="/popcorn_logo.png"><title>403 - Accès refusé - Popcornn</title><link rel="preconnect" href="https://fonts.googleapis.com">${renderHead()}</head> <body class="min-h-screen bg-black text-white overflow-hidden"> ${renderComponent($$result, "ErrorPage", ErrorPage, { "client:load": true, "code": 403, "title": "Accès refusé", "message": "Vous n'avez pas les permissions nécessaires pour accéder à cette ressource.", "showHomeButton": true, "showBackButton": true, "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/errors/ErrorPage", "client:component-export": "default" })} </body></html>`;
}, "D:/Github/popcorn-client/src/pages/403.astro", void 0);
const $$file$H = "D:/Github/popcorn-client/src/pages/403.astro";
const $$url$H = "/./403.html";
const _page$H = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$403,
  file: $$file$H,
  url: $$url$H
}, Symbol.toStringTag, { value: "Module" }));
const page$H = () => _page$H;
var __freeze$3 = Object.freeze;
var __defProp$3 = Object.defineProperty;
var __template$3 = (cooked, raw) => __freeze$3(__defProp$3(cooked, "raw", { value: __freeze$3(raw || cooked.slice()) }));
var _a$3;
const $$404 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate(_a$3 || (_a$3 = __template$3(['<html lang="fr" data-theme="dark" class="overflow-hidden"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="Page non trouvée - Popcorn Torrent"><link rel="icon" type="image/png" href="/popcorn_logo.png"><title>404 - Page non trouvée - Popcornn</title><link rel="preconnect" href="https://fonts.googleapis.com">', `</head> <body class="min-h-screen bg-black text-white overflow-hidden"> <script>
      (function () {
        try {
          var pathname = window.location.pathname || '';

          // /player/<id>  -> /torrents?slug=<id>
          var mPlayer = pathname.match(/^\\/player\\/(.+)$/);
          if (mPlayer && mPlayer[1]) {
            window.location.replace('/torrents?slug=' + encodeURIComponent(mPlayer[1]));
            return;
          }

          // /torrents/<slug> -> /torrents?slug=<slug>
          var mTorrents = pathname.match(/^\\/torrents\\/(.+)$/);
          if (mTorrents && mTorrents[1]) {
            window.location.replace('/torrents?slug=' + encodeURIComponent(mTorrents[1]));
            return;
          }
        } catch (e) {
          // noop
        }
      })();
    <\/script> `, " </body></html>"], ['<html lang="fr" data-theme="dark" class="overflow-hidden"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="Page non trouvée - Popcorn Torrent"><link rel="icon" type="image/png" href="/popcorn_logo.png"><title>404 - Page non trouvée - Popcornn</title><link rel="preconnect" href="https://fonts.googleapis.com">', `</head> <body class="min-h-screen bg-black text-white overflow-hidden"> <script>
      (function () {
        try {
          var pathname = window.location.pathname || '';

          // /player/<id>  -> /torrents?slug=<id>
          var mPlayer = pathname.match(/^\\\\/player\\\\/(.+)$/);
          if (mPlayer && mPlayer[1]) {
            window.location.replace('/torrents?slug=' + encodeURIComponent(mPlayer[1]));
            return;
          }

          // /torrents/<slug> -> /torrents?slug=<slug>
          var mTorrents = pathname.match(/^\\\\/torrents\\\\/(.+)$/);
          if (mTorrents && mTorrents[1]) {
            window.location.replace('/torrents?slug=' + encodeURIComponent(mTorrents[1]));
            return;
          }
        } catch (e) {
          // noop
        }
      })();
    <\/script> `, " </body></html>"])), renderHead(), renderComponent($$result, "ErrorPage", ErrorPage, { "client:load": true, "code": 404, "title": "Page non trouvée", "message": "Désolé, la page que vous recherchez n'existe pas ou a été déplacée.", "showHomeButton": true, "showBackButton": true, "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/errors/ErrorPage", "client:component-export": "default" }));
}, "D:/Github/popcorn-client/src/pages/404.astro", void 0);
const $$file$G = "D:/Github/popcorn-client/src/pages/404.astro";
const $$url$G = "/./404.html";
const _page$G = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$404,
  file: $$file$G,
  url: $$url$G
}, Symbol.toStringTag, { value: "Module" }));
const page$G = () => _page$G;
const $$500 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="fr" data-theme="dark" class="overflow-hidden"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="Erreur serveur - Popcorn Torrent"><link rel="icon" type="image/png" href="/popcorn_logo.png"><title>500 - Erreur serveur - Popcornn</title><link rel="preconnect" href="https://fonts.googleapis.com">${renderHead()}</head> <body class="min-h-screen bg-black text-white overflow-hidden"> ${renderComponent($$result, "ErrorPage", ErrorPage, { "client:load": true, "code": 500, "title": "Erreur serveur", "message": "Une erreur interne s'est produite. Notre équipe a été notifiée et travaille à résoudre le problème.", "showHomeButton": true, "showBackButton": true, "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/errors/ErrorPage", "client:component-export": "default" })} </body></html>`;
}, "D:/Github/popcorn-client/src/pages/500.astro", void 0);
const $$file$F = "D:/Github/popcorn-client/src/pages/500.astro";
const $$url$F = "/./500.html";
const _page$F = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$500,
  file: $$file$F,
  url: $$url$F
}, Symbol.toStringTag, { value: "Module" }));
const page$F = () => _page$F;
const $$Astro$2 = createAstro();
const $$ClientRouter = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$2, $$props, $$slots);
  Astro2.self = $$ClientRouter;
  const { fallback = "animate" } = Astro2.props;
  return renderTemplate`<meta name="astro-view-transitions-enabled" content="true"><meta name="astro-view-transitions-fallback"${addAttribute(fallback, "content")}>${renderScript($$result, "D:/Github/popcorn-client/node_modules/astro/components/ClientRouter.astro?astro&type=script&index=0&lang.ts")}`;
}, "D:/Github/popcorn-client/node_modules/astro/components/ClientRouter.astro", void 0);
const $$WebOSHead = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet">` })}`}`;
}, "D:/Github/popcorn-client/src/components/webos/WebOSHead.astro", void 0);
const $$WebOSBoot = createComponent(($$result, $$props, $$slots) => {
  const isWebOS = false;
  return renderTemplate`${isWebOS}`;
}, "D:/Github/popcorn-client/src/components/webos/WebOSBoot.astro", void 0);
var __freeze$2 = Object.freeze;
var __defProp$2 = Object.defineProperty;
var __template$2 = (cooked, raw) => __freeze$2(__defProp$2(cooked, "raw", { value: __freeze$2(raw || cooked.slice()) }));
var _a$2;
const $$Astro$1 = createAstro();
const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$Layout;
  const { title = "Popcornn" } = Astro2.props;
  return renderTemplate(_a$2 || (_a$2 = __template$2(['<html lang="fr" id="html-root" data-theme="dark" class="overflow-x-hidden"', "", ` data-astro-cid-sckkx6r4> <head><meta charset="UTF-8"><script>
      // Origine client (cloud vs local) pour CSS / JS
      (function() {
        var host = (window.location.hostname || '').toLowerCase();
        var isCloud = host === 'client.popcornn.app' || host.endsWith('.client.popcornn.app');
        document.documentElement.setAttribute('data-client-origin', isCloud ? 'cloud' : 'local');
      })();
    <\/script><script>
      // En tête de console : URL et temps de chargement (après load)
      (function() {
        function logPageInfo() {
          var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
          var loadMs = nav && nav.loadEventEnd ? Math.round(nav.loadEventEnd - nav.fetchStart) : 0;
          console.clear();
          console.log('%c[Page] ' + location.href, 'font-weight: bold');
          console.log('%c[Temps de chargement] ' + loadMs + ' ms', 'font-weight: bold');
        }
        if (document.readyState === 'complete') logPageInfo();
        else window.addEventListener('load', logPageInfo);
      })();
    <\/script><meta name="description" content="Popcornn - Client léger pour serveur Popcornn"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0"><link rel="icon" type="image/png" href="/popcorn_logo.png"><link rel="apple-touch-icon" href="/popcorn_logo.png"><meta name="generator"`, '><meta name="theme-color" content="#a855f7"><title>', "</title>", `<script>
      /* Masquer le bandeau "Chargement" après chaque navigation (View Transitions remplace le body, donc ce script doit être dans le head pour survivre). */
      document.addEventListener('astro:after-swap', function() {
        requestAnimationFrame(function() {
          var el = document.getElementById('popcorn-loading-fallback');
          if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.15s'; setTimeout(function() { el.style.display = 'none'; }, 150); }
        });
      });
    <\/script>`, "", `</head> <body class="min-h-screen bg-page text-white flex flex-col overflow-x-hidden" data-astro-cid-sckkx6r4> <script>
      // Afficher un message d'erreur dans le bandeau de chargement (utilisé par le Layout et WebOSBoot)
      window._popcornShowError = function(msg) {
        var fallback = document.getElementById('popcorn-loading-fallback');
        var errEl = document.getElementById('popcorn-loading-error');
        if (!fallback || !errEl || fallback.style.display === 'none') return;
        var s = String(msg).substring(0, 300);
        errEl.textContent = s;
        errEl.style.display = 'block';
      };
    <\/script> `, ' <!-- Indicateur de chargement immédiat (même style que HLSLoadingSpinner / chargement des pages) --> <div id="popcorn-loading-fallback" class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-page" aria-hidden="true" data-astro-cid-sckkx6r4> <div class="relative w-32 h-32 mb-6" data-astro-cid-sckkx6r4> <div class="absolute inset-0 rounded-full border-4 border-primary/20" data-astro-cid-sckkx6r4></div> <div class="absolute inset-0 rounded-full border-4 border-primary border-t-transparent" style="animation: hls-spin 1s linear infinite" data-astro-cid-sckkx6r4></div> <div class="absolute inset-2 flex items-center justify-center" style="animation: hls-pulse 2s ease-in-out infinite" data-astro-cid-sckkx6r4> <img src="/popcorn_logo.png" alt="Popcorn" class="w-full h-full object-contain drop-shadow-lg" style="filter: drop-shadow(0 0 10px rgba(220, 38, 38, 0.5))" data-astro-cid-sckkx6r4> </div> </div> <p class="text-white/80 text-lg font-medium mb-2" data-astro-cid-sckkx6r4>Chargement...</p> <p id="popcorn-loading-hint" class="text-white/60 text-sm mt-2 max-w-xs text-center hidden" style="display: none;" data-astro-cid-sckkx6r4>Si rien ne s&#39;affiche, quittez et rouvrez l&#39;app.</p> <p id="popcorn-loading-error" class="mt-3 max-w-lg text-center px-3 py-2 rounded text-sm font-medium hidden" style="display: none; background: rgba(220,38,38,0.3); color: #fcd34d;" data-astro-cid-sckkx6r4></p> <div class="flex gap-1 mt-2" data-astro-cid-sckkx6r4> <span class="w-2 h-2 bg-primary rounded-full" style="animation: hls-bounce 1.4s infinite ease-in-out both; animation-delay: 0s" data-astro-cid-sckkx6r4></span> <span class="w-2 h-2 bg-primary rounded-full" style="animation: hls-bounce 1.4s infinite ease-in-out both; animation-delay: 0.2s" data-astro-cid-sckkx6r4></span> <span class="w-2 h-2 bg-primary rounded-full" style="animation: hls-bounce 1.4s infinite ease-in-out both; animation-delay: 0.4s" data-astro-cid-sckkx6r4></span> </div> </div> ', " ", " ", " ", ' <!-- Header (barre en haut) --> <main class="app-main flex-1 w-full overflow-x-hidden safe-area-top" style="padding-top: calc(5rem + var(--safe-area-inset-top));" data-astro-cid-sckkx6r4> ', " </main>  <script>\n      // Initialisation de la langue et du thème depuis les préférences stockées\n      (function() {\n        if (typeof window !== 'undefined') {\n          try {\n            var stored = localStorage.getItem('popcorn_client_user_preferences');\n            if (stored) {\n              var prefs = JSON.parse(stored);\n              if (prefs.language && ['fr', 'en'].includes(prefs.language)) {\n                document.documentElement.lang = prefs.language;\n              }\n              var theme = prefs.theme || 'auto';\n              if (theme === 'auto') {\n                var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;\n                document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';\n              } else if (theme === 'dark' || theme === 'light') {\n                document.documentElement.dataset.theme = theme;\n              }\n            }\n          } catch (e) {\n            // Ignore les erreurs\n          }\n        }\n      })();\n\n      // Intercepter les routes /player/* et rediriger vers /player avec l'ID en query param\n      // Cela permet de gérer les routes dynamiques en mode static\n      (function() {\n        if (typeof window === 'undefined') return;\n        const pathname = window.location.pathname;\n        const playerMatch = pathname.match(/\\/player\\/(.+)$/);\n        if (!playerMatch || !playerMatch[1]) return;\n        const id = playerMatch[1];\n        if (window.location.search.includes('id=') || window.location.search.includes('contentId=')) return;\n        const isFile = window.location.protocol === 'file:';\n        const target = isFile ? 'player.html?id=' + encodeURIComponent(id) : '/player?id=' + encodeURIComponent(id);\n        window.location.replace(target);\n      })();\n\n      // Enregistrer les pieges a erreurs (DOM dispo ici) + masquer le fallback quand l'app a rendu\n      (function() {\n        console.log('[Popcorn] Script bas de page execute');\n        var fallback = document.getElementById('popcorn-loading-fallback');\n        var errEl = document.getElementById('popcorn-loading-error');\n        var hint = document.getElementById('popcorn-loading-hint');\n        var isWebOSEnv = document.documentElement.getAttribute('data-webos') === 'true';\n        function showError(msg) {\n          console.error('[Popcorn] showError:', msg);\n          if (window._popcornShowError) window._popcornShowError(msg);\n        }\n        // Sur webOS, window.onerror est géré par WebOSBoot (composant dédié)\n        if (!isWebOSEnv) {\n          window.onerror = function(m, src, line, col, err) {\n            var msg = (err && err.message) || m || 'script';\n            if (src) msg += ' | ' + src + (line ? ':' + line : '');\n            showError('Erreur: ' + msg);\n            return false;\n          };\n        }\n        window.onunhandledrejection = function(e) {\n          showError('Erreur: ' + ((e.reason && (e.reason.message || String(e.reason))) || 'promise'));\n        };\n        window.addEventListener('error', function(e) {\n          if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) {\n            var ref = e.target.src || e.target.href || '?';\n            var isPrefetch = e.target.tagName === 'LINK' && (e.target.rel || '').toLowerCase().includes('prefetch');\n            if (!isPrefetch) {\n              console.error('[Popcorn] Resource load failed:', ref);\n              showError('Chargement bloque: ' + ref);\n            }\n          }\n        }, true);\n        function hide() {\n          if (!fallback) return;\n          fallback.style.opacity = '0';\n          fallback.style.transition = 'opacity 0.15s ease';\n          setTimeout(function() { fallback.style.display = 'none'; }, 150);\n        }\n        window.addEventListener('popcorn-app-ready', hide, { once: true });\n        window.addEventListener('astro:page-load', function onLoad() {\n          hide();\n          try { sessionStorage.setItem('popcorn-has-loaded', '1'); } catch (e) {}\n        }, { once: true });\n        try {\n          if (sessionStorage.getItem('popcorn-has-loaded')) hide();\n        } catch (e) {}\n        var isDev = document.documentElement.getAttribute('data-dev') === 'true';\n        var hintDelay = isDev ? 15000 : 8000;\n        var slowMsgDelay = isDev ? 20000 : 5000;\n        setTimeout(function() {\n          if (fallback && fallback.style.display !== 'none' && hint) hint.style.display = 'block';\n        }, hintDelay);\n        setTimeout(function() {\n          if (!fallback || fallback.style.display === 'none') return;\n          if (!errEl || !errEl.textContent) {\n            var isWebOSEnv = document.documentElement.getAttribute('data-webos') === 'true';\n            showError(isWebOSEnv\n              ? 'Aucune erreur capturee. Sur webOS (file://) les modules JS peuvent etre bloques. Quittez et rouvrez l app.'\n              : 'Chargement lent. Si la page ne s\\'affiche pas, rechargez.');\n          }\n        }, slowMsgDelay);\n      })();\n    <\/script> </body> </html>"], ['<html lang="fr" id="html-root" data-theme="dark" class="overflow-x-hidden"', "", ` data-astro-cid-sckkx6r4> <head><meta charset="UTF-8"><script>
      // Origine client (cloud vs local) pour CSS / JS
      (function() {
        var host = (window.location.hostname || '').toLowerCase();
        var isCloud = host === 'client.popcornn.app' || host.endsWith('.client.popcornn.app');
        document.documentElement.setAttribute('data-client-origin', isCloud ? 'cloud' : 'local');
      })();
    <\/script><script>
      // En tête de console : URL et temps de chargement (après load)
      (function() {
        function logPageInfo() {
          var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
          var loadMs = nav && nav.loadEventEnd ? Math.round(nav.loadEventEnd - nav.fetchStart) : 0;
          console.clear();
          console.log('%c[Page] ' + location.href, 'font-weight: bold');
          console.log('%c[Temps de chargement] ' + loadMs + ' ms', 'font-weight: bold');
        }
        if (document.readyState === 'complete') logPageInfo();
        else window.addEventListener('load', logPageInfo);
      })();
    <\/script><meta name="description" content="Popcornn - Client léger pour serveur Popcornn"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0"><link rel="icon" type="image/png" href="/popcorn_logo.png"><link rel="apple-touch-icon" href="/popcorn_logo.png"><meta name="generator"`, '><meta name="theme-color" content="#a855f7"><title>', "</title>", `<script>
      /* Masquer le bandeau "Chargement" après chaque navigation (View Transitions remplace le body, donc ce script doit être dans le head pour survivre). */
      document.addEventListener('astro:after-swap', function() {
        requestAnimationFrame(function() {
          var el = document.getElementById('popcorn-loading-fallback');
          if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.15s'; setTimeout(function() { el.style.display = 'none'; }, 150); }
        });
      });
    <\/script>`, "", `</head> <body class="min-h-screen bg-page text-white flex flex-col overflow-x-hidden" data-astro-cid-sckkx6r4> <script>
      // Afficher un message d'erreur dans le bandeau de chargement (utilisé par le Layout et WebOSBoot)
      window._popcornShowError = function(msg) {
        var fallback = document.getElementById('popcorn-loading-fallback');
        var errEl = document.getElementById('popcorn-loading-error');
        if (!fallback || !errEl || fallback.style.display === 'none') return;
        var s = String(msg).substring(0, 300);
        errEl.textContent = s;
        errEl.style.display = 'block';
      };
    <\/script> `, ' <!-- Indicateur de chargement immédiat (même style que HLSLoadingSpinner / chargement des pages) --> <div id="popcorn-loading-fallback" class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-page" aria-hidden="true" data-astro-cid-sckkx6r4> <div class="relative w-32 h-32 mb-6" data-astro-cid-sckkx6r4> <div class="absolute inset-0 rounded-full border-4 border-primary/20" data-astro-cid-sckkx6r4></div> <div class="absolute inset-0 rounded-full border-4 border-primary border-t-transparent" style="animation: hls-spin 1s linear infinite" data-astro-cid-sckkx6r4></div> <div class="absolute inset-2 flex items-center justify-center" style="animation: hls-pulse 2s ease-in-out infinite" data-astro-cid-sckkx6r4> <img src="/popcorn_logo.png" alt="Popcorn" class="w-full h-full object-contain drop-shadow-lg" style="filter: drop-shadow(0 0 10px rgba(220, 38, 38, 0.5))" data-astro-cid-sckkx6r4> </div> </div> <p class="text-white/80 text-lg font-medium mb-2" data-astro-cid-sckkx6r4>Chargement...</p> <p id="popcorn-loading-hint" class="text-white/60 text-sm mt-2 max-w-xs text-center hidden" style="display: none;" data-astro-cid-sckkx6r4>Si rien ne s&#39;affiche, quittez et rouvrez l&#39;app.</p> <p id="popcorn-loading-error" class="mt-3 max-w-lg text-center px-3 py-2 rounded text-sm font-medium hidden" style="display: none; background: rgba(220,38,38,0.3); color: #fcd34d;" data-astro-cid-sckkx6r4></p> <div class="flex gap-1 mt-2" data-astro-cid-sckkx6r4> <span class="w-2 h-2 bg-primary rounded-full" style="animation: hls-bounce 1.4s infinite ease-in-out both; animation-delay: 0s" data-astro-cid-sckkx6r4></span> <span class="w-2 h-2 bg-primary rounded-full" style="animation: hls-bounce 1.4s infinite ease-in-out both; animation-delay: 0.2s" data-astro-cid-sckkx6r4></span> <span class="w-2 h-2 bg-primary rounded-full" style="animation: hls-bounce 1.4s infinite ease-in-out both; animation-delay: 0.4s" data-astro-cid-sckkx6r4></span> </div> </div> ', " ", " ", " ", ' <!-- Header (barre en haut) --> <main class="app-main flex-1 w-full overflow-x-hidden safe-area-top" style="padding-top: calc(5rem + var(--safe-area-inset-top));" data-astro-cid-sckkx6r4> ', " </main>  <script>\n      // Initialisation de la langue et du thème depuis les préférences stockées\n      (function() {\n        if (typeof window !== 'undefined') {\n          try {\n            var stored = localStorage.getItem('popcorn_client_user_preferences');\n            if (stored) {\n              var prefs = JSON.parse(stored);\n              if (prefs.language && ['fr', 'en'].includes(prefs.language)) {\n                document.documentElement.lang = prefs.language;\n              }\n              var theme = prefs.theme || 'auto';\n              if (theme === 'auto') {\n                var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;\n                document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';\n              } else if (theme === 'dark' || theme === 'light') {\n                document.documentElement.dataset.theme = theme;\n              }\n            }\n          } catch (e) {\n            // Ignore les erreurs\n          }\n        }\n      })();\n\n      // Intercepter les routes /player/* et rediriger vers /player avec l'ID en query param\n      // Cela permet de gérer les routes dynamiques en mode static\n      (function() {\n        if (typeof window === 'undefined') return;\n        const pathname = window.location.pathname;\n        const playerMatch = pathname.match(/\\\\/player\\\\/(.+)$/);\n        if (!playerMatch || !playerMatch[1]) return;\n        const id = playerMatch[1];\n        if (window.location.search.includes('id=') || window.location.search.includes('contentId=')) return;\n        const isFile = window.location.protocol === 'file:';\n        const target = isFile ? 'player.html?id=' + encodeURIComponent(id) : '/player?id=' + encodeURIComponent(id);\n        window.location.replace(target);\n      })();\n\n      // Enregistrer les pieges a erreurs (DOM dispo ici) + masquer le fallback quand l'app a rendu\n      (function() {\n        console.log('[Popcorn] Script bas de page execute');\n        var fallback = document.getElementById('popcorn-loading-fallback');\n        var errEl = document.getElementById('popcorn-loading-error');\n        var hint = document.getElementById('popcorn-loading-hint');\n        var isWebOSEnv = document.documentElement.getAttribute('data-webos') === 'true';\n        function showError(msg) {\n          console.error('[Popcorn] showError:', msg);\n          if (window._popcornShowError) window._popcornShowError(msg);\n        }\n        // Sur webOS, window.onerror est géré par WebOSBoot (composant dédié)\n        if (!isWebOSEnv) {\n          window.onerror = function(m, src, line, col, err) {\n            var msg = (err && err.message) || m || 'script';\n            if (src) msg += ' | ' + src + (line ? ':' + line : '');\n            showError('Erreur: ' + msg);\n            return false;\n          };\n        }\n        window.onunhandledrejection = function(e) {\n          showError('Erreur: ' + ((e.reason && (e.reason.message || String(e.reason))) || 'promise'));\n        };\n        window.addEventListener('error', function(e) {\n          if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) {\n            var ref = e.target.src || e.target.href || '?';\n            var isPrefetch = e.target.tagName === 'LINK' && (e.target.rel || '').toLowerCase().includes('prefetch');\n            if (!isPrefetch) {\n              console.error('[Popcorn] Resource load failed:', ref);\n              showError('Chargement bloque: ' + ref);\n            }\n          }\n        }, true);\n        function hide() {\n          if (!fallback) return;\n          fallback.style.opacity = '0';\n          fallback.style.transition = 'opacity 0.15s ease';\n          setTimeout(function() { fallback.style.display = 'none'; }, 150);\n        }\n        window.addEventListener('popcorn-app-ready', hide, { once: true });\n        window.addEventListener('astro:page-load', function onLoad() {\n          hide();\n          try { sessionStorage.setItem('popcorn-has-loaded', '1'); } catch (e) {}\n        }, { once: true });\n        try {\n          if (sessionStorage.getItem('popcorn-has-loaded')) hide();\n        } catch (e) {}\n        var isDev = document.documentElement.getAttribute('data-dev') === 'true';\n        var hintDelay = isDev ? 15000 : 8000;\n        var slowMsgDelay = isDev ? 20000 : 5000;\n        setTimeout(function() {\n          if (fallback && fallback.style.display !== 'none' && hint) hint.style.display = 'block';\n        }, hintDelay);\n        setTimeout(function() {\n          if (!fallback || fallback.style.display === 'none') return;\n          if (!errEl || !errEl.textContent) {\n            var isWebOSEnv = document.documentElement.getAttribute('data-webos') === 'true';\n            showError(isWebOSEnv\n              ? 'Aucune erreur capturee. Sur webOS (file://) les modules JS peuvent etre bloques. Quittez et rouvrez l app.'\n              : 'Chargement lent. Si la page ne s\\\\'affiche pas, rechargez.');\n          }\n        }, slowMsgDelay);\n      })();\n    <\/script> </body> </html>"])), addAttribute(void 0, "data-webos"), addAttribute(void 0, "data-dev"), addAttribute(Astro2.generator, "content"), title, renderTemplate`${renderComponent($$result, "ClientRouter", $$ClientRouter, { "data-astro-cid-sckkx6r4": true })}`, renderComponent($$result, "WebOSHead", $$WebOSHead, { "data-astro-cid-sckkx6r4": true }), renderHead(), renderComponent($$result, "WebOSBoot", $$WebOSBoot, { "data-astro-cid-sckkx6r4": true }), renderComponent($$result, "TVNavigationProvider", null, { "client:only": "preact", "client:component-hydration": "only", "data-astro-cid-sckkx6r4": true, "client:component-path": "D:/Github/popcorn-client/src/components/tv/TVNavigationProvider", "client:component-export": "default" }), renderComponent($$result, "ServerConnectionCheck", null, { "client:only": "preact", "client:component-hydration": "only", "data-astro-cid-sckkx6r4": true, "client:component-path": "D:/Github/popcorn-client/src/components/ServerConnectionCheck", "client:component-export": "default" }), renderComponent($$result, "Navbar", null, { "client:only": "preact", "client:component-hydration": "only", "data-astro-cid-sckkx6r4": true, "client:component-path": "D:/Github/popcorn-client/src/components/layout/Navbar", "client:component-export": "default" }), renderComponent($$result, "FeedbackFAB", null, { "client:only": "preact", "client:component-hydration": "only", "data-astro-cid-sckkx6r4": true, "client:component-path": "D:/Github/popcorn-client/src/components/layout/FeedbackFAB", "client:component-export": "default" }), renderSlot($$result, $$slots["default"]));
}, "D:/Github/popcorn-client/src/layouts/Layout.astro", void 0);
const $$Dashboard = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Tableau de bord - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Dashboard", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/dashboard/Dashboard", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/dashboard.astro", void 0);
const $$file$E = "D:/Github/popcorn-client/src/pages/dashboard.astro";
const $$url$E = "/./dashboard.html";
const _page$E = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Dashboard,
  file: $$file$E,
  url: $$url$E
}, Symbol.toStringTag, { value: "Module" }));
const page$E = () => _page$E;
const $$Demandes = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Demandes - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-screen bg-black text-white"> ${renderComponent($$result2, "DemandesPage", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/demandes/DemandesPage", "client:component-export": "default" })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/demandes.astro", void 0);
const $$file$D = "D:/Github/popcorn-client/src/pages/demandes.astro";
const $$url$D = "/./demandes.html";
const _page$D = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Demandes,
  file: $$file$D,
  url: $$url$D
}, Symbol.toStringTag, { value: "Module" }));
const page$D = () => _page$D;
const $$Demo = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Démo - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "DemoEntry", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/DemoEntry", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/demo.astro", void 0);
const $$file$C = "D:/Github/popcorn-client/src/pages/demo.astro";
const $$url$C = "/./demo.html";
const _page$C = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Demo,
  file: $$file$C,
  url: $$url$C
}, Symbol.toStringTag, { value: "Module" }));
const page$C = () => _page$C;
const $$Disclaimer = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Avertissement et Clause de Non-Responsabilité - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-screen bg-base-100 text-base-content p-4 sm:p-6 lg:p-8"> <div class="max-w-4xl mx-auto"> <h1 class="text-4xl font-bold mb-8 text-center">Avertissement et Clause de Non-Responsabilité</h1> <div class="bg-base-200 rounded-lg p-6 sm:p-8 mb-6 border border-base-300"> <p class="text-sm text-base-content/70 mb-6 italic">
Dernière mise à jour : ${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" })} </p> <div class="space-y-6 text-base-content/90"> <div> <h2 class="text-2xl font-bold text-base-content mb-3">1. Nature de l'Application</h2> <p class="leading-relaxed">
Popcorn Client est un outil technique permettant de se connecter à un serveur distant 
              pour la recherche, le téléchargement et la lecture de contenu multimédia via le protocole 
              BitTorrent. Cette application est fournie "en l'état" à des fins éducatives et techniques uniquement.
</p> <p class="leading-relaxed mt-2">
Cette application fonctionne comme un client léger qui se connecte à un serveur distant. 
              Elle ne stocke pas de contenu, ne gère pas de torrents directement, et agit uniquement 
              comme une interface utilisateur pour interagir avec un serveur sous le contrôle de l'utilisateur.
</p> </div> <div> <h2 class="text-2xl font-bold text-base-content mb-3">2. Responsabilité de l'Utilisateur</h2> <p class="leading-relaxed mb-3"> <strong class="text-base-content">L'utilisateur est entièrement et exclusivement responsable</strong>
de tous les contenus qu'il recherche, télécharge, stocke, ou consulte via cette application. 
              L'utilisateur reconnaît qu'il est de sa seule responsabilité de :
</p> <ul class="list-disc list-inside ml-4 space-y-2"> <li>Respecter toutes les lois et réglementations applicables dans sa juridiction, y compris mais sans s'y limiter, les lois sur le droit d'auteur, la propriété intellectuelle, et la protection des données</li> <li>Respecter les droits de propriété intellectuelle (droits d'auteur, marques déposées, brevets, secrets commerciaux, etc.) de tous les tiers</li> <li>Vérifier la légalité du téléchargement et de la consultation de tout contenu avant d'effectuer ces actions</li> <li>Obtenir les autorisations nécessaires, licences, ou permissions appropriées avant de télécharger, stocker, ou consulter du contenu protégé</li> <li>Respecter les conditions d'utilisation de tous les services tiers utilisés via cette application</li> <li>Assurer la sécurité de son système et de ses données personnelles</li> </ul> </div> <div> <h2 class="text-2xl font-bold text-base-content mb-3">3. Non-Responsabilité du Développeur</h2> <p class="leading-relaxed mb-3">
Le développeur de cette application (ci-après "le Développeur") décline expressément toute responsabilité 
              concernant :
</p> <ul class="list-disc list-inside ml-4 space-y-2"> <li>Le contenu téléchargé, stocké, ou consulté par l'utilisateur, y compris mais sans s'y limiter, la légalité, la qualité, l'exactitude, ou la pertinence de ce contenu</li> <li>La légalité des actions effectuées par l'utilisateur via cette application dans toute juridiction</li> <li>Les violations de droits d'auteur, de propriété intellectuelle, ou de toute autre loi résultant de l'utilisation de l'application par l'utilisateur</li> <li>Les dommages directs, indirects, consécutifs, accessoires, spéciaux, ou punitifs résultant de l'utilisation ou de l'impossibilité d'utiliser cette application</li> <li>La perte de données, les interruptions de service, les erreurs techniques, ou les problèmes de compatibilité</li> <li>Les dommages causés à des tiers par l'utilisation de cette application par l'utilisateur</li> <li>Les coûts de réparation, de remplacement, ou de services nécessaires pour corriger tout problème résultant de l'utilisation de l'application</li> </ul> <p class="leading-relaxed mt-3">
Le Développeur ne garantit pas que l'application fonctionnera de manière ininterrompue, sans erreur, 
              ou que les défauts seront corrigés. L'application est fournie "TEL QUELLE" sans aucune garantie.
</p> </div> <div> <h2 class="text-2xl font-bold text-base-content mb-3">4. Protection des Données et Confidentialité</h2> <p class="leading-relaxed mb-3">
Cette application utilise un chiffrement end-to-end (E2E) pour protéger les données utilisateur. 
              Le Développeur n'a <strong class="text-base-content">aucun accès</strong> aux données personnelles, 
              aux préférences, aux bibliothèques de contenu, ou à toute autre information stockée par l'utilisateur.
</p> <p class="leading-relaxed mb-3">
Toutes les communications entre le client et le serveur sont chiffrées, et les données sensibles 
              sont stockées localement sur l'appareil de l'utilisateur ou sur un serveur sous le contrôle exclusif 
              de l'utilisateur. Le Développeur ne collecte, ne stocke, ni ne transmet aucune donnée personnelle 
              ou information sur l'utilisation de l'application.
</p> <p class="leading-relaxed">
L'utilisateur est seul responsable de la sécurité de ses données, de son serveur, et de la 
              configuration de son environnement. Le Développeur ne peut être tenu responsable de toute perte 
              ou divulgation de données résultant d'une mauvaise configuration, d'une faille de sécurité, 
              ou d'une utilisation inappropriée de l'application.
</p> </div> <div> <h2 class="text-2xl font-bold text-base-content mb-3">5. Avertissement Légal</h2> <div class="bg-warning/20 border border-warning rounded-lg p-4 mb-3"> <p class="leading-relaxed font-semibold text-warning-content"> <strong>ATTENTION :</strong> Le téléchargement et la consultation de contenu protégé par le droit 
                d'auteur sans autorisation peut constituer une violation de la loi dans de nombreuses juridictions, 
                y compris mais sans s'y limiter :
</p> <ul class="list-disc list-inside ml-4 mt-2 space-y-1"> <li>Les violations du droit d'auteur (Copyright Act aux États-Unis, Code de la propriété intellectuelle en France, etc.)</li> <li>Les violations de lois sur la propriété intellectuelle</li> <li>Les violations de lois sur la protection des données</li> <li>Les violations de conditions d'utilisation de services tiers</li> </ul> </div> <p class="leading-relaxed">
L'utilisateur est seul responsable de s'assurer que ses actions sont légales dans sa juridiction. 
              Le Développeur ne peut être tenu responsable des conséquences légales, financières, ou pénales 
              résultant de l'utilisation de cette application, y compris mais sans s'y limiter :
</p> <ul class="list-disc list-inside ml-4 mt-2 space-y-1"> <li>Les poursuites judiciaires intentées par des tiers</li> <li>Les amendes ou pénalités imposées par des autorités</li> <li>Les dommages-intérêts réclamés par des titulaires de droits</li> <li>Les coûts juridiques et de défense</li> </ul> </div> <div> <h2 class="text-2xl font-bold text-base-content mb-3">6. Utilisation à Vos Risques</h2> <p class="leading-relaxed mb-3">
Cette application est fournie "TEL QUELLE", sans garantie d'aucune sorte, expresse ou implicite, 
              y compris mais sans s'y limiter :
</p> <ul class="list-disc list-inside ml-4 space-y-2"> <li>Les garanties de qualité marchande</li> <li>Les garanties d'adéquation à un usage particulier</li> <li>Les garanties de non-contrefaçon</li> <li>Les garanties de sécurité ou de protection contre les virus, malwares, ou autres composants nuisibles</li> <li>Les garanties de disponibilité, de fiabilité, ou de performance</li> </ul> <p class="leading-relaxed mt-3">
L'utilisateur utilise cette application à ses propres risques. Le Développeur ne garantit pas 
              que l'application répondra aux exigences de l'utilisateur, qu'elle fonctionnera de manière 
              ininterrompue ou sans erreur, ou que les défauts seront corrigés.
</p> </div> <div> <h2 class="text-2xl font-bold text-base-content mb-3">7. Limitation de Responsabilité</h2> <p class="leading-relaxed mb-3">
Dans toute la mesure permise par la loi applicable, le Développeur ne pourra en aucun cas être 
              tenu responsable de :
</p> <ul class="list-disc list-inside ml-4 space-y-2"> <li>Tout dommage direct, indirect, consécutif, accessoire, spécial, ou punitif</li> <li>La perte de profits, de revenus, de données, d'opportunités commerciales, ou de bonne volonté</li> <li>Les coûts de remplacement de biens ou services</li> <li>Les dommages résultant de l'utilisation ou de l'impossibilité d'utiliser l'application</li> </ul> <p class="leading-relaxed mt-3">
Cette limitation de responsabilité s'applique même si le Développeur a été informé de la 
              possibilité de tels dommages et même si un recours prévu dans le présent accord échoue dans 
              son objet essentiel.
</p> </div> <div> <h2 class="text-2xl font-bold text-base-content mb-3">8. Acceptation des Conditions</h2> <p class="leading-relaxed mb-3">
En utilisant cette application, l'utilisateur reconnaît avoir lu, compris et accepté 
              les termes de ce disclaimer dans leur intégralité. Si l'utilisateur n'accepte pas ces conditions, 
              il ne doit pas utiliser cette application et doit immédiatement cesser toute utilisation.
</p> <p class="leading-relaxed">
L'utilisation continue de l'application après la modification de ce disclaimer constitue 
              une acceptation des termes modifiés. Il est de la responsabilité de l'utilisateur de consulter 
              régulièrement cette page pour prendre connaissance des éventuelles modifications.
</p> </div> <div> <h2 class="text-2xl font-bold text-base-content mb-3">9. Droit Applicable et Juridiction</h2> <p class="leading-relaxed">
Ce disclaimer est régi par les lois applicables dans la juridiction du Développeur. 
              Tout litige découlant de ou en relation avec ce disclaimer ou l'utilisation de l'application 
              sera soumis à la juridiction exclusive des tribunaux compétents dans cette juridiction.
</p> </div> <div> <h2 class="text-2xl font-bold text-base-content mb-3">10. Contact</h2> <p class="leading-relaxed">
Pour toute question concernant ce disclaimer, l'utilisateur peut consulter la documentation 
              de l'application ou se référer aux canaux de communication officiels du projet.
</p> </div> </div> </div> <div class="text-center mt-8"> <a href="/" class="btn btn-primary">
Retour à l'application
</a> </div> </div> </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/disclaimer.astro", void 0);
const $$file$B = "D:/Github/popcorn-client/src/pages/disclaimer.astro";
const $$url$B = "/./disclaimer.html";
const _page$B = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Disclaimer,
  file: $$file$B,
  url: $$url$B
}, Symbol.toStringTag, { value: "Module" }));
const page$B = () => _page$B;
const $$Discover = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Découverte - Popcorn" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "DiscoverMediaDetailRoute", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/discover/DiscoverMediaDetailRoute", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/discover.astro", void 0);
const $$file$A = "D:/Github/popcorn-client/src/pages/discover.astro";
const $$url$A = "/./discover.html";
const _page$A = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Discover,
  file: $$file$A,
  url: $$url$A
}, Symbol.toStringTag, { value: "Module" }));
const page$A = () => _page$A;
const $$Downloads = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Téléchargements - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "DownloadsList", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/downloads/DownloadsList", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/downloads.astro", void 0);
const $$file$z = "D:/Github/popcorn-client/src/pages/downloads.astro";
const $$url$z = "/./downloads.html";
const _page$z = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Downloads,
  file: $$file$z,
  url: $$url$z
}, Symbol.toStringTag, { value: "Module" }));
const page$z = () => _page$z;
function FeatureCard({
  title,
  description,
  icon
}) {
  return jsxs("div", {
    className: "bg-white/5 border border-white/10 rounded-lg p-6 hover:bg-white/10 transition-colors",
    children: [icon && jsx("div", {
      className: "text-4xl mb-4",
      children: icon
    }), jsx("h3", {
      className: "text-xl font-bold text-white mb-2",
      children: title
    }), jsx("p", {
      className: "text-gray-300",
      children: description
    })]
  });
}
const $$Features = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Fonctionnalités - Popcorn Torrent" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-screen bg-black text-white"> <div class="container mx-auto px-4 py-16"> <h1 class="text-4xl md:text-5xl font-bold text-center mb-4">
Fonctionnalités
</h1> <p class="text-xl text-gray-300 text-center mb-12 max-w-3xl mx-auto">
Découvrez toutes les fonctionnalités de Popcorn Torrent
</p> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16"> ${renderComponent($$result2, "FeatureCard", FeatureCard, { "client:load": true, "title": "Streaming Torrent en Direct", "description": "Regardez vos films et séries préférés en streaming direct depuis les torrents. Plus besoin de télécharger avant de regarder - le streaming commence immédiatement.", "icon": "🎬", "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/FeatureCard", "client:component-export": "default" })} ${renderComponent($$result2, "FeatureCard", FeatureCard, { "client:load": true, "title": "Multi-Indexers", "description": "Support complet de plusieurs indexers de torrents : Jackett, YGG, et bien d'autres. Recherche unifiée à travers tous vos indexers configurés.", "icon": "🔍", "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/FeatureCard", "client:component-export": "default" })} ${renderComponent($$result2, "FeatureCard", FeatureCard, { "client:load": true, "title": "Intégration TMDb", "description": "Enrichissement automatique avec les métadonnées TMDb : affiches haute qualité, synopsis, genres, notes, dates de sortie, et bien plus encore.", "icon": "🎭", "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/FeatureCard", "client:component-export": "default" })} ${renderComponent($$result2, "FeatureCard", FeatureCard, { "client:load": true, "title": "Synchronisation Cloud", "description": "Synchronisez votre configuration (indexers, clés API, etc.) entre plusieurs instances via notre plateforme cloud sécurisée.", "icon": "☁️", "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/FeatureCard", "client:component-export": "default" })} ${renderComponent($$result2, "FeatureCard", FeatureCard, { "client:load": true, "title": "Interface Moderne", "description": "Interface utilisateur moderne et responsive, optimisée pour la navigation TV, desktop et mobile. Design soigné et intuitive.", "icon": "📱", "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/FeatureCard", "client:component-export": "default" })} ${renderComponent($$result2, "FeatureCard", FeatureCard, { "client:load": true, "title": "API REST Complète", "description": "API REST complète avec authentification JWT pour l'intégration et l'automatisation de vos workflows. Documentation complète incluse.", "icon": "⚙️", "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/FeatureCard", "client:component-export": "default" })} ${renderComponent($$result2, "FeatureCard", FeatureCard, { "client:load": true, "title": "Connexion QR Code", "description": "Connectez facilement vos instances locales au cloud avec un simple scan de QR code depuis votre appareil mobile.", "icon": "📱", "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/FeatureCard", "client:component-export": "default" })} ${renderComponent($$result2, "FeatureCard", FeatureCard, { "client:load": true, "title": "Gestion des Priorités", "description": "Configurez des indexers avec des priorités et des fallbacks pour optimiser vos recherches et garantir la disponibilité.", "icon": "⚡", "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/FeatureCard", "client:component-export": "default" })} ${renderComponent($$result2, "FeatureCard", FeatureCard, { "client:load": true, "title": "Déploiement Docker", "description": "Déploiement simplifié avec Docker et Docker Compose. Prêt à l'emploi en quelques minutes, sans configuration complexe.", "icon": "🐳", "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/FeatureCard", "client:component-export": "default" })} </div> <div class="text-center"> <a href="/docs/docker/quick-start" class="inline-block bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-4 rounded-lg transition-colors">
Commencer maintenant
</a> </div> </div> </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/features.astro", void 0);
const $$file$y = "D:/Github/popcorn-client/src/pages/features.astro";
const $$url$y = "/./features.html";
const _page$y = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Features,
  file: $$file$y,
  url: $$url$y
}, Symbol.toStringTag, { value: "Module" }));
const page$y = () => _page$y;
const $$Films = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Films - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "FilmsDashboard", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/dashboard/FilmsDashboard", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/films.astro", void 0);
const $$file$x = "D:/Github/popcorn-client/src/pages/films.astro";
const $$url$x = "/./films.html";
const _page$x = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Films,
  file: $$file$x,
  url: $$url$x
}, Symbol.toStringTag, { value: "Module" }));
const page$x = () => _page$x;
const $$Installation = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Installation - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-screen bg-page text-white py-8 px-4"> <div class="container mx-auto max-w-6xl"> <div class="mb-8"> <h1 class="text-4xl font-bold mb-2">Installation avec Docker</h1> <p class="text-gray-400">Guide d'installation de Popcorn avec Docker Compose</p> </div> <!-- Prérequis --> <div class="bg-gray-900 rounded-lg p-6 mb-6"> <h2 class="text-2xl font-bold mb-4">Prérequis</h2> <ul class="list-disc list-inside space-y-2 text-gray-300"> <li>Docker et Docker Compose installés</li> <li>Un compte cloud Popcorn (inscription sur <a href="https://popcornn.app" target="_blank" class="text-primary-400 hover:underline">popcornn.app</a>)</li> <li>Un code d'invitation (obtenu depuis votre compte cloud)</li> </ul> </div> <!-- Docker Compose complet --> <div class="bg-gray-900 rounded-lg p-6 mb-6"> <h2 class="text-2xl font-bold mb-4">Docker Compose complet (Client + Serveur)</h2> <p class="text-gray-400 mb-4">
Ce fichier docker-compose.yml contient les deux services : le client web (frontend) et le serveur backend.
</p> <div class="bg-black rounded-lg p-4 overflow-x-auto"> <pre class="text-sm text-gray-300"><code>name: popcorn
services:
  client:
    # image: docker.io/bobdivx/popcorn-frontend:latest  # Commenté pour développement local
    build:
      context: ../popcorn-client
      dockerfile: Dockerfile
      pull: false
    command: []
    container_name: popcorn-client
    cpu_shares: 100
    depends_on:
      server:
        condition: service_started
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=4321
      - BACKEND_URL=http://server:3000
      - PUBLIC_BACKEND_URL=http://server:3000
      - PUBLIC_CLIENT_URL=http://client:4321
      - TZ=$&#123;TZ:-Europe/Paris&#125;
      - PUID=$&#123;PUID:-1000&#125;
      - PGID=$&#123;PGID:-1000&#125;
      # Variables Turso en lecture seule pour valider les codes d'invitation
      # Ces variables permettent uniquement de LIRE les codes d'invitation depuis Turso
      # Les données utilisateur restent dans SQLite local
      - TURSO_READONLY_DATABASE_URL=$&#123;TURSO_READONLY_DATABASE_URL&#125;
      - TURSO_READONLY_AUTH_TOKEN=$&#123;TURSO_READONLY_AUTH_TOKEN&#125;
    labels:
      icon: https://raw.githubusercontent.com/bobdivx/popcorn/main/public/favicon.svg
    ports:
      - target: 4321
        published: "4325"
        protocol: tcp
    privileged: false
    restart: unless-stopped
    networks:
      - popcorn-network
    deploy:
      resources:
        limits:
          memory: "1G"
        reservations:
          memory: "256M"
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:4321/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    cap_add: []
  server:
    # image: docker.io/bobdivx/popcorn-backend:latest  # Commenté pour développement local
    build:
      context: ./backend
      dockerfile: Dockerfile
      pull: false
    command: []
    container_name: popcorn-server
    cpu_shares: 100
    # Note: TMDB, Jackett et les indexers sont configurés par l'utilisateur via l'interface web
    # et stockés dans la base de données SQLite. Aucune variable d'environnement nécessaire.
    environment:
      - SERVER_HOST=0.0.0.0
      - SERVER_PORT=3000
      - DOWNLOAD_DIR=/app/downloads
      - API_BASE_URL=$&#123;API_BASE_URL:-http://client:4321&#125;
      - API_USERNAME=$&#123;API_USERNAME&#125;
      - API_PASSWORD=$&#123;API_PASSWORD&#125;
      - MAX_DOWNLOADS=$&#123;MAX_DOWNLOADS:-5&#125;
      - MAX_UPLOAD_SLOTS=$&#123;MAX_UPLOAD_SLOTS:-4&#125;
      - LIBRQBIT_API_URL=$&#123;LIBRQBIT_API_URL:-http://127.0.0.1:3030&#125;
      - LOG_LEVEL=$&#123;LOG_LEVEL:-info&#125;
      - RUST_LOG=$&#123;RUST_LOG:-info&#125;
      - ANNOUNCE_INTERVAL=$&#123;ANNOUNCE_INTERVAL:-1800&#125;
      - TZ=$&#123;TZ:-Europe/Paris&#125;
      - PUID=$&#123;PUID:-1000&#125;
      - PGID=$&#123;PGID:-1000&#125;
    labels:
      icon: https://raw.githubusercontent.com/bobdivx/popcorn/main/public/favicon.svg
    ports:
      - target: 3000
        published: "3000"
        protocol: tcp
    privileged: false
    restart: unless-stopped
    volumes:
      - ./data/.data:/app/.data
      # Répertoire de téléchargement à la racine du projet
      # Pour développement local, utiliser: ./downloads:/app/downloads
      - ./data/downloads:/app/downloads
      - ./data/transcode_cache:/app/downloads/transcode_cache
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3000/api/client/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    cap_add: []
    networks:
      - popcorn-network
    deploy:
      resources:
        limits:
          memory: "2G"
        reservations:
          memory: "512M"
networks:
  popcorn-network:
    name: popcorn-network
    driver: bridge</code></pre> </div> <button id="copy-full-compose-btn" class="mt-4 bg-primary hover:bg-primary-700 text-white px-6 py-3 rounded-lg transition-colors shadow-primary font-semibold">
Copier le docker-compose.yml complet
</button> </div> <!-- Instructions --> <div class="bg-gray-900 rounded-lg p-6 mb-6"> <h2 class="text-2xl font-bold mb-4">Instructions d'installation</h2> <ol class="list-decimal list-inside space-y-4 text-gray-300"> <li> <strong class="text-white">Créez un répertoire pour votre installation :</strong> <pre class="bg-black rounded p-3 mt-2 text-sm overflow-x-auto"><code>mkdir popcorn
cd popcorn</code></pre> </li> <li> <strong class="text-white">Créez le fichier docker-compose.yml :</strong> <p class="text-gray-400 mt-1">Copiez le contenu ci-dessus dans un fichier nommé <code class="bg-gray-800 px-2 py-1 rounded">docker-compose.yml</code></p> </li> <li> <strong class="text-white">Créez les répertoires nécessaires :</strong> <pre class="bg-black rounded p-3 mt-2 text-sm overflow-x-auto"><code>mkdir -p data/.data data/downloads data/transcode_cache</code></pre> </li> <li> <strong class="text-white">Démarrez les services :</strong> <pre class="bg-black rounded p-3 mt-2 text-sm overflow-x-auto"><code>docker-compose up -d</code></pre> </li> <li> <strong class="text-white">Initialisez la base de données :</strong> <pre class="bg-black rounded p-3 mt-2 text-sm overflow-x-auto"><code>docker-compose exec server cargo run --bin init-db-local</code></pre> </li> <li> <strong class="text-white">Accédez à l'interface web :</strong> <p class="text-gray-400 mt-1">
Ouvrez votre navigateur à l'adresse <a href="http://localhost:4325" target="_blank" class="text-primary-400 hover:underline">http://localhost:4325</a> </p> </li> <li> <strong class="text-white">Configurez votre compte cloud :</strong> <p class="text-gray-400 mt-1">
Utilisez votre code d'invitation pour créer votre compte local et le synchroniser avec votre compte cloud.
</p> </li> </ol> </div> <!-- Variables d'environnement --> <div class="bg-gray-900 rounded-lg p-6 mb-6"> <h2 class="text-2xl font-bold mb-4">Variables d'environnement optionnelles</h2> <p class="text-gray-400 mb-4">
Vous pouvez créer un fichier <code class="bg-gray-800 px-2 py-1 rounded">.env</code> pour personnaliser la configuration :
</p> <div class="bg-black rounded-lg p-4 overflow-x-auto"> <pre class="text-sm text-gray-300"><code># Fuseau horaire
TZ=Europe/Paris

# Identifiants utilisateur/groupe (pour les permissions de fichiers)
PUID=1000
PGID=1000

# Configuration API
API_USERNAME=CHANGE_ME
API_PASSWORD=CHANGE_ME

# Limites de téléchargement
MAX_DOWNLOADS=5
MAX_UPLOAD_SLOTS=4

# Niveau de log
LOG_LEVEL=info
RUST_LOG=info</code></pre> </div> </div> <!-- Commandes utiles --> <div class="bg-gray-900 rounded-lg p-6"> <h2 class="text-2xl font-bold mb-4">Commandes utiles</h2> <div class="space-y-3"> <div> <strong class="text-white">Voir les logs :</strong> <pre class="bg-black rounded p-3 mt-2 text-sm overflow-x-auto"><code>docker-compose logs -f</code></pre> </div> <div> <strong class="text-white">Arrêter les services :</strong> <pre class="bg-black rounded p-3 mt-2 text-sm overflow-x-auto"><code>docker-compose down</code></pre> </div> <div> <strong class="text-white">Redémarrer les services :</strong> <pre class="bg-black rounded p-3 mt-2 text-sm overflow-x-auto"><code>docker-compose restart</code></pre> </div> <div> <strong class="text-white">Voir le statut des conteneurs :</strong> <pre class="bg-black rounded p-3 mt-2 text-sm overflow-x-auto"><code>docker-compose ps</code></pre> </div> <div> <strong class="text-white">Mettre à jour les images :</strong> <pre class="bg-black rounded p-3 mt-2 text-sm overflow-x-auto"><code>docker-compose pull
docker-compose up -d</code></pre> </div> </div> </div> </div> </div> ${renderScript($$result2, "D:/Github/popcorn-client/src/pages/installation.astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "D:/Github/popcorn-client/src/pages/installation.astro", void 0);
const $$file$w = "D:/Github/popcorn-client/src/pages/installation.astro";
const $$url$w = "/./installation.html";
const _page$w = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Installation,
  file: $$file$w,
  url: $$url$w
}, Symbol.toStringTag, { value: "Module" }));
const page$w = () => _page$w;
const STORAGE_KEY = "popcorn_backend_url";
const DEMO_MODE_STORAGE_KEY = "popcorn_demo_mode";
function getDefaultBackendUrl() {
  if (typeof window !== "undefined") {
    const ua = navigator.userAgent || "";
    const isAndroid = /Android/i.test(ua);
    if (isAndroid) {
      const isEmulator = /sdk/i.test(ua) || /Emulator/i.test(ua) || /Android SDK/i.test(ua);
      if (isEmulator) {
        return "http://10.0.2.2:3000";
      } else {
        return "http://10.0.2.2:3000";
      }
    }
  }
  return "http://127.0.0.1:3000";
}
function isDemoMode() {
  if (typeof window === "undefined") {
    return false;
  }
  const path = window.location.pathname || "";
  if (path === "/demo" || path.startsWith("/demo/")) {
    return true;
  }
  if (localStorage.getItem(DEMO_MODE_STORAGE_KEY) === "1") {
    return true;
  }
  const demoUrl = "".trim();
  return !!demoUrl;
}
function getBackendUrl() {
  if (typeof window === "undefined") {
    const result = getDefaultBackendUrl();
    return (result || "").trim().replace(/\/$/, "") || getDefaultBackendUrl();
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored;
    }
  } catch (error) {
    console.warn("[backend-config] Erreur lors de la lecture de localStorage:", error);
  }
  const demoUrl = "".trim().replace(/\/$/, "");
  if (demoUrl) {
    return demoUrl;
  }
  const defaultUrl = getDefaultBackendUrl();
  return defaultUrl;
}
function isTauri() {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}
const DEMO_USER_ID = "demo-user-id";
const DEMO_EMAIL = "demo@popcorn.local";
function success(data) {
  return {
    success: true,
    data
  };
}
function mockContentItem(overrides) {
  var _a2;
  return {
    id: overrides.id,
    title: overrides.title,
    type: overrides.type,
    poster: overrides.poster,
    backdrop: overrides.backdrop,
    overview: overrides.overview,
    rating: overrides.rating,
    releaseDate: overrides.releaseDate,
    tmdbId: (_a2 = overrides.tmdbId) != null ? _a2 : null,
    seeds: overrides.seeds,
    peers: overrides.peers,
    quality: overrides.quality,
    codec: overrides.codec
  };
}
const WEBTORRENT_POSTERS = {
  bigBuckBunny: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/300px-Big_buck_bunny_poster_big.jpg",
  sintel: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Sintel_poster.jpg/300px-Sintel_poster.jpg",
  tearsOfSteel: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Tears_of_Steel_poster.jpg/300px-Tears_of_Steel_poster.jpg",
  cosmosLaundromat: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Blu-Ray_of_Cosmos_Laundromat_-_Blender.jpg/300px-Blu-Ray_of_Cosmos_Laundromat_-_Blender.jpg"
};
function getDemoWebBaseUrl() {
  var _a2, _b;
  const env = "".trim().replace(/\/$/, "");
  if (env) return env;
  if (typeof window !== "undefined" && ((_b = (_a2 = window.location) == null ? void 0 : _a2.hostname) == null ? void 0 : _b.includes("popcornn.app"))) {
    return `${window.location.protocol}//www.popcornn.app`;
  }
  return "http://localhost:4321";
}
const DEMO_LIBRARY_VIDEO_PATH = "/media/films/Big-Buck/video.mp4";
const MOCK_HERO = mockContentItem({
  id: "big-buck-bunny",
  title: "Big Buck Bunny",
  type: "movie",
  poster: WEBTORRENT_POSTERS.bigBuckBunny,
  backdrop: WEBTORRENT_POSTERS.bigBuckBunny,
  overview: "Court métrage d'animation open source (Blender Foundation, 2008). Un lapin géant se venge des bullies qui harcèlent les petits animaux. Domaine public.",
  rating: 7.5,
  releaseDate: "2008-04-10",
  tmdbId: 0,
  seeds: 100,
  peers: 50,
  quality: "1080p",
  codec: "x264"
});
const MOCK_MOVIES = [mockContentItem({
  id: "big-buck-bunny",
  title: "Big Buck Bunny",
  type: "movie",
  poster: WEBTORRENT_POSTERS.bigBuckBunny,
  backdrop: WEBTORRENT_POSTERS.bigBuckBunny,
  overview: "Court métrage Blender Foundation (2008). Domaine public — torrent de test WebTorrent.",
  rating: 7.5,
  releaseDate: "2008-04-10",
  quality: "1080p",
  codec: "x264",
  seeds: 100,
  peers: 50
}), mockContentItem({
  id: "sintel",
  title: "Sintel",
  type: "movie",
  poster: WEBTORRENT_POSTERS.sintel,
  backdrop: WEBTORRENT_POSTERS.sintel,
  overview: "Court métrage Blender Foundation (2010). Une jeune femme part à la recherche d'un dragon. CC BY — WebTorrent.",
  rating: 8,
  releaseDate: "2010-09-27",
  quality: "1080p",
  codec: "x264",
  seeds: 80,
  peers: 20
}), mockContentItem({
  id: "tears-of-steel",
  title: "Tears of Steel",
  type: "movie",
  poster: WEBTORRENT_POSTERS.tearsOfSteel,
  backdrop: WEBTORRENT_POSTERS.tearsOfSteel,
  overview: "Court métrage Blender Foundation (2012). Science-fiction, mélange prises réelles et 3D. CC BY — WebTorrent.",
  rating: 7.2,
  releaseDate: "2012-09-26",
  quality: "1080p",
  codec: "x264",
  seeds: 60,
  peers: 15
}), mockContentItem({
  id: "cosmos-laundromat",
  title: "Cosmos Laundromat",
  type: "movie",
  poster: WEBTORRENT_POSTERS.cosmosLaundromat,
  backdrop: WEBTORRENT_POSTERS.cosmosLaundromat,
  overview: "Court métrage Blender Institute (2015). Franck, un mouton dépressif, rencontre un vendeur mystérieux. CC BY — WebTorrent.",
  rating: 7.8,
  releaseDate: "2015-08-10",
  quality: "1080p",
  codec: "x265",
  seeds: 45,
  peers: 10
})];
const MOCK_SERIES = [mockContentItem({
  id: "sintel",
  title: "Sintel",
  type: "tv",
  poster: WEBTORRENT_POSTERS.sintel,
  backdrop: WEBTORRENT_POSTERS.sintel,
  overview: "Court métrage Blender Foundation (2010). CC BY — WebTorrent.",
  rating: 8,
  releaseDate: "2010-09-27",
  quality: "1080p",
  seeds: 80,
  peers: 20
}), mockContentItem({
  id: "tears-of-steel",
  title: "Tears of Steel",
  type: "tv",
  poster: WEBTORRENT_POSTERS.tearsOfSteel,
  backdrop: WEBTORRENT_POSTERS.tearsOfSteel,
  overview: "Court métrage Blender Foundation (2012). CC BY — WebTorrent.",
  rating: 7.2,
  releaseDate: "2012-09-26",
  quality: "1080p",
  seeds: 60,
  peers: 15
})];
function createDemoServerApi() {
  return {
    isAuthenticated() {
      return true;
    },
    getAccessToken() {
      return "demo-token";
    },
    getCurrentUserId() {
      return DEMO_USER_ID;
    },
    getServerUrl() {
      return "http://demo.local";
    },
    async getSetupStatus() {
      return success({
        needsSetup: false,
        hasUsers: true,
        hasIndexers: false,
        hasBackendConfig: true,
        hasTmdbKey: false,
        hasTorrents: false,
        hasDownloadLocation: false,
        backendReachable: true
      });
    },
    async getMe() {
      return success({
        id: DEMO_USER_ID,
        email: DEMO_EMAIL
      });
    },
    async checkServerHealth() {
      return success({
        status: "ok",
        reachable: true
      });
    },
    async getDashboardDataPhase1() {
      return success({
        hero: {
          id: MOCK_HERO.id,
          title: MOCK_HERO.title,
          overview: MOCK_HERO.overview,
          poster: MOCK_HERO.poster,
          backdrop: MOCK_HERO.backdrop,
          type: MOCK_HERO.type,
          releaseDate: MOCK_HERO.releaseDate,
          rating: MOCK_HERO.rating
        },
        continueWatching: [],
        popularMovies: MOCK_MOVIES,
        popularSeries: MOCK_SERIES,
        recentAdditions: [],
        fastTorrents: []
      });
    },
    async getDashboardDataPhase2() {
      return success({
        recentAdditions: [],
        fastTorrents: []
      });
    },
    async getDashboardData() {
      return success({
        hero: {
          id: MOCK_HERO.id,
          title: MOCK_HERO.title,
          overview: MOCK_HERO.overview,
          poster: MOCK_HERO.poster,
          backdrop: MOCK_HERO.backdrop,
          type: MOCK_HERO.type,
          releaseDate: MOCK_HERO.releaseDate,
          rating: MOCK_HERO.rating
        },
        continueWatching: [],
        popularMovies: MOCK_MOVIES,
        popularSeries: MOCK_SERIES,
        recentAdditions: [],
        fastTorrents: []
      });
    },
    async getFilmsData() {
      const films = MOCK_MOVIES.map((m) => __spreadProps(__spreadValues({}, m), {
        firstAirDate: void 0
      }));
      return success(films);
    },
    async getSeriesData() {
      const series = MOCK_SERIES.map((s) => __spreadProps(__spreadValues({}, s), {
        firstAirDate: s.releaseDate
      }));
      return success(series);
    },
    async getFilmsDataPaginated() {
      return success(MOCK_MOVIES);
    },
    async getSeriesDataPaginated() {
      return success(MOCK_SERIES);
    },
    async getSyncStatus() {
      return success({
        is_syncing: false,
        progress: null,
        stats: {
          films: 0,
          series: 0
        }
      });
    },
    async startSync() {
      return success(void 0);
    },
    async stopSync() {
      return success(void 0);
    },
    async getSyncSettings() {
      return success({
        sync_frequency_minutes: 60,
        is_enabled: true,
        max_torrents_per_category: 0
      });
    },
    async updateSyncSettings() {
      return success(void 0);
    },
    async clearSyncTorrents() {
      return success(0);
    },
    async downloadSyncLog() {
      return success(void 0);
    },
    async getIndexers() {
      return success([]);
    },
    async getTmdbKey() {
      return success({
        apiKey: null,
        hasKey: false
      });
    },
    async getTmdbKeyExport() {
      return success({
        apiKey: null,
        hasKey: false
      });
    },
    async saveTmdbKey() {
      return success(void 0);
    },
    async deleteTmdbKey() {
      return success(void 0);
    },
    async testTmdbKey() {
      return success({
        valid: true
      });
    },
    async getClientTorrentConfig() {
      return success({});
    },
    async getMediaPaths() {
      return success({
        download_dir_root: "/data/downloads",
        films_path: "media/films",
        series_path: "media/series",
        default_path: null,
        films_root: "/data/downloads/media/films",
        series_root: "/data/downloads/media/series"
      });
    },
    async putMediaPaths() {
      return this.getMediaPaths();
    },
    async listExplorerFiles() {
      return success([{
        name: "media",
        path: "media",
        is_directory: true
      }, {
        name: "downloads",
        path: "downloads",
        is_directory: true
      }]);
    },
    async getTorrentGroup() {
      return success({
        slug: "demo-group",
        title: MOCK_HERO.title,
        variants: [],
        torrents: []
      });
    },
    async getTorrentGroupByTmdbId() {
      return success({
        slug: "demo-group",
        title: MOCK_HERO.title,
        variants: [],
        torrents: []
      });
    },
    async getTorrentById() {
      return success({
        id: "demo-1",
        title: MOCK_HERO.title,
        category: "films"
      });
    },
    async search() {
      return success([...MOCK_MOVIES, ...MOCK_SERIES]);
    },
    async getStream() {
      return success({
        url: "",
        type: "hls"
      });
    },
    async getLibrary() {
      const demoItem = {
        info_hash: "local_demo_big_buck_bunny",
        name: "Big Buck Bunny",
        download_path: "/media/films/Big-Buck/video.mp4",
        file_size: null,
        exists: true,
        is_file: true,
        is_directory: false,
        slug: "demo-big-buck-bunny",
        category: "films",
        tmdb_id: null,
        tmdb_type: "movie",
        poster_url: WEBTORRENT_POSTERS.bigBuckBunny,
        hero_image_url: WEBTORRENT_POSTERS.bigBuckBunny,
        synopsis: "Court métrage Blender Foundation (2008). Domaine public — démo.",
        release_date: "2008-04-10",
        genres: null,
        vote_average: 7.5,
        runtime: null,
        quality: "1080p",
        resolution: "1080p",
        video_codec: null,
        audio_codec: null,
        language: null,
        source_format: null,
        is_local_only: true,
        demo_stream_url: `${getDemoWebBaseUrl()}${DEMO_LIBRARY_VIDEO_PATH}`
      };
      return success([demoItem]);
    },
    async addToLibrary() {
      return success({});
    },
    async removeFromLibrary() {
      return success(void 0);
    },
    async getFavorites() {
      return success([]);
    },
    async addFavorite() {
      return success({});
    },
    async removeFavorite() {
      return success(void 0);
    },
    async scanLocalMedia() {
      return success("ok");
    },
    async getIndexerTypes() {
      return success([]);
    },
    async createIndexer() {
      return success({});
    },
    async updateIndexer() {
      return success({});
    },
    async deleteIndexer() {
      return success(void 0);
    },
    async getIndexerCategories() {
      return success({});
    },
    async updateIndexerCategories() {
      return success(void 0);
    },
    async getIndexerAvailableCategories() {
      return success([]);
    },
    async getTmdbGenres() {
      return success({
        movies: [],
        tv: []
      });
    },
    async testIndexer() {
      return success({});
    },
    async testIndexerStream() {
      return success({});
    },
    async resetBackendDatabase() {
      return success(void 0);
    },
    async forceCacheCleanup() {
      return success({
        cleaned_count: 0
      });
    },
    async getTranscodingConfig() {
      return success({
        max_concurrent_transcodings: 2
      });
    },
    async updateTranscodingConfig(_body) {
      return success({
        max_concurrent_transcodings: _body.max_concurrent_transcodings
      });
    },
    async getSystemResources() {
      return success({
        process_memory_mb: 128.5,
        process_cpu_usage_percent: 2.1,
        system_memory_total_mb: 16384,
        system_memory_used_mb: 8192,
        gpu_available: false,
        hwaccels: []
      });
    },
    async discoverMovies() {
      return success({
        results: MOCK_MOVIES
      });
    },
    async discoverTv() {
      return success({
        results: MOCK_SERIES
      });
    },
    logout() {
    },
    async getTwoFactorStatus() {
      return success({
        enabled: false
      });
    },
    async enableTwoFactor() {
      return success({
        message: "ok"
      });
    },
    async disableTwoFactor() {
      return success({
        message: "ok"
      });
    },
    async sendTwoFactorCode() {
      return success({
        message: "ok"
      });
    },
    async verifyTwoFactorCode() {
      return success({});
    },
    async initQuickConnect() {
      return success({});
    },
    async authorizeQuickConnect() {
      return success({});
    },
    async getQuickConnectStatus() {
      return success({});
    },
    async connectQuickConnect() {
      return success({});
    },
    async createLocalUser() {
      return success({});
    },
    async listLocalUsers() {
      return success([]);
    },
    async getLocalUser() {
      return success({});
    },
    async updateLocalUser() {
      return success({});
    },
    async deleteLocalUser() {
      return success(void 0);
    },
    async syncFriendShares() {
      return success("ok");
    },
    async checkTorrentDownload() {
      return success({
        downloadable: false,
        status_code: 200,
        message: "demo"
      });
    }
  };
}
let demoApiInstance = null;
function getDemoServerApi() {
  if (!demoApiInstance) {
    demoApiInstance = createDemoServerApi();
  }
  return demoApiInstance;
}
function getJWTSecretSync() {
  if (typeof window !== "undefined") {
    try {
      const storedSecret = localStorage.getItem("jwt_secret");
      if (storedSecret) {
        return storedSecret;
      }
    } catch (error) {
    }
  }
  {
    throw new Error("JWT_SECRET must be defined. Please login or register to get your user-specific JWT secret.");
  }
}
const JWT_ACCESS_EXPIRES_IN = "1h";
const JWT_REFRESH_EXPIRES_IN = "30d";
function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function getCryptoSubtle() {
  var _a2, _b, _c2, _d2, _e2;
  const isTauriEnv = isTauri();
  if (typeof window !== "undefined") {
    const protocol = (_a2 = window.location) == null ? void 0 : _a2.protocol;
    const hostname = ((_b = window.location) == null ? void 0 : _b.hostname) || "";
    console.log("[jwt-client] Contexte:", {
      isTauri: isTauriEnv,
      protocol,
      hostname,
      hasCrypto: typeof crypto !== "undefined",
      hasCryptoSubtle: typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined"
    });
  }
  if (typeof crypto !== "undefined") {
    if (typeof crypto.subtle !== "undefined" && crypto.subtle !== null) {
      return crypto.subtle;
    }
    if (isTauriEnv) {
      console.error("[jwt-client] ⚠️ Tauri détecté mais crypto.subtle n'est pas disponible. Cela peut indiquer un problème de configuration ou de timing.");
      throw new Error("Web Crypto API (crypto.subtle) is not available in Tauri environment. This is unexpected as Tauri should always provide a secure context. Please check your Tauri configuration and ensure you are using a recent version of Tauri.");
    }
    if (typeof window !== "undefined") {
      const protocol = (_c2 = window.location) == null ? void 0 : _c2.protocol;
      const hostname = ((_d2 = window.location) == null ? void 0 : _d2.hostname) || "";
      if (protocol === "http:" && hostname !== "localhost" && hostname !== "127.0.0.1") {
        const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname);
        const isLocalDomain = hostname.endsWith(".local");
        console.error("[jwt-client] ⚠️ Web Crypto API bloquée:", {
          protocol,
          hostname,
          isLocalIP,
          isLocalDomain,
          reason: "Les navigateurs modernes bloquent crypto.subtle en HTTP (sauf localhost)"
        });
        if (isLocalIP || isLocalDomain) {
          throw new Error(`Web Crypto API is blocked by the browser when using HTTP (even for local addresses). Current URL: ${protocol}//${hostname}${((_e2 = window.location) == null ? void 0 : _e2.port) ? ":" + window.location.port : ""} 

⚠️ Ce n'est PAS un problème CORS, mais une restriction de sécurité du navigateur.

Solutions for Docker/Web browser:
1. Use HTTPS (recommended): Configure a reverse proxy (nginx/traefik) with SSL certificate
2. Use localhost: Access via http://localhost:PORT instead of the IP/domain
3. For development: Some browsers allow HTTP on localhost, try http://localhost:PORT

Note: Tauri apps (Android/Desktop) work with HTTP because they provide a secure context by default.`);
        } else {
          throw new Error(`Web Crypto API requires HTTPS or localhost in browser environments. Current protocol: ${protocol}, hostname: ${hostname}. 

⚠️ Ce n'est PAS un problème CORS, mais une restriction de sécurité du navigateur.

Solutions:
1. Use HTTPS: Configure SSL certificate for your domain
2. Use localhost: Access via http://localhost:PORT
3. Use Tauri app: Tauri provides secure context even with HTTP`);
        }
      }
    }
  }
  if (typeof globalThis !== "undefined") {
    const nodeCrypto = globalThis.crypto;
    if (nodeCrypto && nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
      return nodeCrypto.webcrypto.subtle;
    }
  }
  try {
    const nodeCrypto = require("crypto");
    if (nodeCrypto && nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
      return nodeCrypto.webcrypto.subtle;
    }
  } catch (e) {
  }
  const envInfo = typeof window !== "undefined" ? "navigateur" : typeof globalThis !== "undefined" ? "Node.js" : "inconnu";
  const cryptoInfo = typeof crypto !== "undefined" ? `crypto.subtle=${typeof crypto.subtle}` : "crypto=undefined";
  throw new Error(`Web Crypto API is not available in this ${envInfo} environment. This code requires: - A modern browser with HTTPS (or localhost), - Tauri environment, - Or Node.js 15+ with crypto.webcrypto.subtle support. Current: ${cryptoInfo}`);
}
async function createSignature(header2, payload, secret) {
  const subtle = getCryptoSubtle();
  const encoder2 = new TextEncoder();
  const keyData = encoder2.encode(secret);
  const key = await subtle.importKey("raw", keyData, {
    name: "HMAC",
    hash: "SHA-256"
  }, false, ["sign"]);
  const data = encoder2.encode(`${header2}.${payload}`);
  const signature = await subtle.sign("HMAC", key, data);
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  return base64UrlEncode(signatureBase64);
}
function getExpirationSeconds(expiresIn) {
  const now = Math.floor(Date.now() / 1e3);
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return now + 3600;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s":
      return now + value;
    case "m":
      return now + value * 60;
    case "h":
      return now + value * 3600;
    case "d":
      return now + value * 86400;
    default:
      return now + 3600;
  }
}
async function generateAccessToken(payload) {
  if (typeof window === "undefined") {
    throw new Error("generateAccessToken can only be called in a client context (browser or Tauri). It cannot be called during SSR.");
  }
  const jwtSecret = getJWTSecretSync();
  const normalizedPayload = __spreadProps(__spreadValues({}, payload), {
    userId: payload.userId || payload.id || "",
    type: "access",
    iat: Math.floor(Date.now() / 1e3),
    exp: getExpirationSeconds(JWT_ACCESS_EXPIRES_IN)
  });
  const header2 = {
    alg: "HS256",
    typ: "JWT"
  };
  const headerBase64 = base64UrlEncode(JSON.stringify(header2));
  const payloadBase64 = base64UrlEncode(JSON.stringify(normalizedPayload));
  const signature = await createSignature(headerBase64, payloadBase64, jwtSecret);
  return `${headerBase64}.${payloadBase64}.${signature}`;
}
async function generateRefreshToken(payload) {
  if (typeof window === "undefined") {
    throw new Error("generateRefreshToken can only be called in a client context (browser or Tauri). It cannot be called during SSR.");
  }
  const jwtSecret = getJWTSecretSync();
  const normalizedPayload = __spreadProps(__spreadValues({}, payload), {
    userId: payload.userId || payload.id || "",
    type: "refresh",
    iat: Math.floor(Date.now() / 1e3),
    exp: getExpirationSeconds(JWT_REFRESH_EXPIRES_IN)
  });
  const header2 = {
    alg: "HS256",
    typ: "JWT"
  };
  const headerBase64 = base64UrlEncode(JSON.stringify(header2));
  const payloadBase64 = base64UrlEncode(JSON.stringify(normalizedPayload));
  const signature = await createSignature(headerBase64, payloadBase64, jwtSecret);
  return `${headerBase64}.${payloadBase64}.${signature}`;
}
class LocalStorage {
  /**
   * Stocke une valeur
   */
  static setItem(key, value) {
    if (typeof window === "undefined") return;
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(`${this.PREFIX}${key}`, serialized);
    } catch (error) {
      console.error(`Erreur lors du stockage de ${key}:`, error);
    }
  }
  /**
   * Récupère une valeur
   */
  static getItem(key) {
    if (typeof window === "undefined") return null;
    try {
      const item = localStorage.getItem(`${this.PREFIX}${key}`);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Erreur lors de la récupération de ${key}:`, error);
      return null;
    }
  }
  /**
   * Supprime une valeur
   */
  static removeItem(key) {
    if (typeof window === "undefined") return;
    localStorage.removeItem(`${this.PREFIX}${key}`);
  }
  /**
   * Vide tout le stockage
   */
  static clear() {
    if (typeof window === "undefined") return;
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(this.PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }
}
__publicField(LocalStorage, "PREFIX", "popcorn_client_");
class PreferencesManager {
  /**
   * Récupère les préférences utilisateur
   */
  static getPreferences() {
    return LocalStorage.getItem(this.KEY) || {
      theme: "auto",
      language: "fr",
      autoplay: false,
      quality: "auto",
      showZeroSeedTorrents: true,
      torrentsInitialLimit: 100,
      torrentsLoadMoreLimit: 50,
      torrentsRecentLimit: 50,
      mediaLanguages: [],
      minQuality: ""
    };
  }
  /**
   * Met à jour les préférences utilisateur
   */
  static updatePreferences(preferences) {
    const current = this.getPreferences();
    const updated = __spreadValues(__spreadValues({}, current), preferences);
    LocalStorage.setItem(this.KEY, updated);
  }
  /**
   * Réinitialise les préférences
   */
  static resetPreferences() {
    LocalStorage.removeItem(this.KEY);
  }
  /**
   * Définit l'emplacement de téléchargement
   */
  static setDownloadLocation(path) {
    LocalStorage.setItem("download_location", path);
  }
  /**
   * Récupère l'emplacement de téléchargement
   */
  static getDownloadLocation() {
    return LocalStorage.getItem("download_location");
  }
}
__publicField(PreferencesManager, "KEY", "user_preferences");
class TokenManager {
  /**
   * Stocke les tokens locaux
   */
  static setTokens(accessToken, refreshToken) {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
  }
  /**
   * Stocke les tokens cloud (de popcorn-web)
   */
  static setCloudTokens(accessToken, refreshToken) {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.CLOUD_ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(this.CLOUD_REFRESH_TOKEN_KEY, refreshToken);
  }
  /**
   * Récupère le token d'accès local
   */
  static getAccessToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }
  /**
   * Récupère le token d'accès cloud (pour les appels à popcorn-web)
   */
  static getCloudAccessToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.CLOUD_ACCESS_TOKEN_KEY);
  }
  /**
   * Récupère le token de rafraîchissement local
   */
  static getRefreshToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }
  /**
   * Récupère le token de rafraîchissement cloud
   */
  static getCloudRefreshToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.CLOUD_REFRESH_TOKEN_KEY);
  }
  /**
   * Stocke le secret JWT de l'utilisateur
   */
  static setJWTSecret(jwtSecret) {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.JWT_SECRET_KEY, jwtSecret);
  }
  /**
   * Récupère le secret JWT de l'utilisateur
   */
  static getJWTSecret() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.JWT_SECRET_KEY);
  }
  /**
   * Supprime tous les tokens (locaux et cloud) et le secret JWT
   */
  static clearTokens() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.CLOUD_ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.CLOUD_REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.JWT_SECRET_KEY);
  }
  /**
   * Supprime uniquement les tokens cloud (pour arrêter le polling feedback après 401 sans déconnecter le backend).
   */
  static clearCloudTokens() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.CLOUD_ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.CLOUD_REFRESH_TOKEN_KEY);
  }
  /**
   * Récupère les informations utilisateur stockées dans localStorage
   * (même clé que ServerApiClient.STORAGE_USER_KEY = 'popcorn_user')
   */
  static getUser() {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("popcorn_user");
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error("Erreur lors de la récupération de l'utilisateur:", error);
      return null;
    }
  }
}
__publicField(TokenManager, "ACCESS_TOKEN_KEY", "access_token");
__publicField(TokenManager, "REFRESH_TOKEN_KEY", "refresh_token");
__publicField(TokenManager, "CLOUD_ACCESS_TOKEN_KEY", "cloud_access_token");
__publicField(TokenManager, "CLOUD_REFRESH_TOKEN_KEY", "cloud_refresh_token");
__publicField(TokenManager, "JWT_SECRET_KEY", "jwt_secret");
const POPCORN_WEB_BASE = "https://popcornn.app";
function getPopcornWebBaseUrl() {
  return POPCORN_WEB_BASE.replace(/\/$/, "");
}
function getPopcornWebApiUrl() {
  return getPopcornWebBaseUrl() + "/api/v1";
}
async function fetchJsonWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, __spreadProps(__spreadValues({}, init), {
      signal: controller.signal
    }));
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      const corsError = new Error(`CORS bloque l'accès à ${url}. En mode navigateur web, l'accès direct à popcorn-web est bloqué par CORS. En Tauri Android/Desktop, native-fetch contourne CORS.`);
      corsError.isCorsError = true;
      throw corsError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
async function requestJson(url, init, timeoutMs) {
  var _a2, _b;
  try {
    const response = await fetchJsonWithTimeout(url, init, timeoutMs);
    const rawText = await response.text().catch(() => "");
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (e) {
      data = {};
    }
    if (response.ok) return {
      ok: true,
      status: response.status,
      data
    };
    return {
      ok: false,
      status: response.status,
      data,
      rawText
    };
  } catch (error) {
    const isCorsError = error instanceof Error && (error.isCorsError || error.message.includes("CORS") || error.message.includes("Failed to fetch") || error.message.includes("Access-Control-Allow-Origin") || error.message.includes("blocked by CORS policy"));
    if (isTauri() && (isCorsError || error instanceof TypeError)) {
      const logNative = async (message) => {
        try {
          const {
            invoke
          } = await import("@tauri-apps/api/core");
          await invoke("log-message", {
            message
          });
        } catch (e) {
        }
      };
      try {
        const {
          invoke
        } = await import("@tauri-apps/api/core");
        const method = (init == null ? void 0 : init.method) && typeof init.method === "string" ? init.method : "GET";
        const headerPairs = [];
        try {
          const headersObj = new Headers(init == null ? void 0 : init.headers);
          headersObj.forEach((value, key) => headerPairs.push([key, value]));
        } catch (e) {
        }
        const body = typeof (init == null ? void 0 : init.body) === "string" || (init == null ? void 0 : init.body) instanceof String ? String(init.body) : void 0;
        let nativeRes;
        try {
          nativeRes = await invoke("native-fetch", {
            url,
            method,
            headers: headerPairs,
            body,
            timeoutMs
          });
        } catch (invokeError) {
          const errorMsg = invokeError instanceof Error ? invokeError.message : String(invokeError);
          if (errorMsg.includes("not found") || errorMsg.includes("Command native-fetch")) {
            const {
              fetch: httpFetch
            } = await import("@tauri-apps/plugin-http");
            const httpResponse = await httpFetch(url, {
              method,
              headers: Object.fromEntries(headerPairs),
              body
            });
            const responseBody = await httpResponse.text();
            return {
              ok: httpResponse.ok,
              status: httpResponse.status,
              data: responseBody ? JSON.parse(responseBody) : {},
              rawText: responseBody
            };
          }
          throw invokeError;
        }
        const response = new Response((_a2 = nativeRes == null ? void 0 : nativeRes.body) != null ? _a2 : "", {
          status: (_b = nativeRes == null ? void 0 : nativeRes.status) != null ? _b : 0,
          headers: (() => {
            const h2 = new Headers();
            try {
              for (const [k, v] of (nativeRes == null ? void 0 : nativeRes.headers) || []) {
                if (k) h2.set(k, v);
              }
            } catch (e) {
            }
            return h2;
          })()
        });
        const rawText = await response.text().catch(() => "");
        let data = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch (e) {
          data = {};
        }
        if (response.ok) return {
          ok: true,
          status: response.status,
          data
        };
        return {
          ok: false,
          status: response.status,
          data,
          rawText
        };
      } catch (e) {
        const eStr = typeof e === "string" ? e : e instanceof Error ? e.message || "" : String(e);
        await logNative(`[popcorn-debug] popcorn-web requestJson fallback failed url=${url} err=${JSON.stringify({
          type: typeof e,
          value: eStr
        })}`);
        if (e instanceof Error && e.name === "AbortError") {
          return {
            ok: false,
            status: 0,
            data: {},
            rawText: "timeout"
          };
        }
        throw e;
      }
    }
    if (isCorsError) {
      return {
        ok: false,
        status: 0,
        data: {
          corsError: true,
          message: "CORS bloque l'accès. Vérifiez que popcorn-web a CORS configuré pour cet endpoint."
        },
        rawText: "CORS_ERROR"
      };
    }
    throw error;
  }
}
async function loginCloud(email, password) {
  var _a2;
  const apiUrl = getPopcornWebApiUrl();
  const fullUrl = `${apiUrl}/auth/login`;
  try {
    const res = await requestJson(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    }, 1e4);
    if (!res.ok) {
      if (res.status === 500 || res.status === 503 || res.status === 0) {
        console.error("[POPCORN-WEB] API non disponible:", {
          status: res.status,
          body: res.rawText || res.data
        });
        return null;
      }
      const errorData = res.data || {};
      const errorMessage = errorData.message || `Erreur ${res.status} lors de la connexion`;
      console.error("[POPCORN-WEB] Erreur API:", {
        status: res.status,
        message: errorMessage,
        data: errorData
      });
      const error = new Error(errorMessage);
      error.status = res.status;
      throw error;
    }
    const data = res.data;
    if ((data == null ? void 0 : data.success) && (data == null ? void 0 : data.requires2FA)) {
      return {
        user: {
          id: "",
          email
        },
        // User sera rempli après vérification 2FA
        accessToken: "",
        refreshToken: "",
        requires2FA: true,
        tempToken: (_a2 = data.data) == null ? void 0 : _a2.tempToken
      };
    }
    if ((data == null ? void 0 : data.success) && (data == null ? void 0 : data.data)) {
      return {
        user: data.data.user,
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        jwtSecret: data.data.jwtSecret
      };
    }
    console.error("[POPCORN-WEB] Réponse invalide:", {
      data,
      success: data == null ? void 0 : data.success,
      hasData: !!(data == null ? void 0 : data.data),
      dataString: JSON.stringify(data, null, 2)
    });
    throw new Error("Réponse invalide de l'API");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[POPCORN-WEB] Timeout lors de la connexion:", {
        url: fullUrl,
        timeout: "10s"
      });
      return null;
    }
    if (error instanceof TypeError) {
      console.error("[POPCORN-WEB] Erreur réseau:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
        url: fullUrl
      });
      return null;
    }
    if (error instanceof Error && (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("ECONNREFUSED") || error.message.includes("Failed to fetch") || error.message.includes("ENOTFOUND") || error.message.includes("ECONNRESET"))) {
      console.error("[POPCORN-WEB] Erreur de connexion réseau:", {
        message: error.message,
        name: error.name,
        url: fullUrl
      });
      return null;
    }
    console.error("[POPCORN-WEB] Erreur lors de la connexion:", {
      error,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Unknown",
      url: fullUrl
    });
    throw error;
  }
}
async function registerCloud(email, password, inviteCode) {
  try {
    const apiUrl = getPopcornWebApiUrl();
    const fullUrl = `${apiUrl}/auth/register`;
    const res = await requestJson(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        inviteCode
      })
    }, 1e4);
    if (!res.ok) {
      if (res.status === 500 || res.status === 503 || res.status === 0) {
        console.warn("[POPCORN-WEB] API non disponible pour l'inscription cloud");
        return null;
      }
      const errorData = res.data || {};
      throw new Error(errorData.message || "Erreur lors de l'inscription");
    }
    const data = res.data;
    if (data.success && data.data) {
      return {
        user: data.data.user,
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        jwtSecret: data.data.jwtSecret,
        grantsAdmin: data.data.grantsAdmin || false
      };
    }
    throw new Error("Réponse invalide de l'API");
  } catch (error) {
    console.warn("[POPCORN-WEB] Impossible de contacter l'API popcorn-web:", error);
    if (error instanceof Error && error.message.includes("Erreur")) {
      throw error;
    }
    return null;
  }
}
const authMethods = {
  /**
   * Inscription utilisateur
   * Unifié : génération de tokens JWT côté client pour tous les modes
   */
  async register(email, password, inviteCode) {
    var _a2;
    const username = (email.split("@")[0] || email || "user").trim();
    const res = await this.backendRequest("/api/client/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        username,
        password,
        invite_code: inviteCode
      })
    });
    if (!res.success) return res;
    const user = ((_a2 = res.data) == null ? void 0 : _a2.user) || res.data;
    const userId = (user == null ? void 0 : user.id) || "";
    const userEmail = (user == null ? void 0 : user.email) || email;
    const usernameForToken = (user == null ? void 0 : user.username) || username;
    const {
      accessToken,
      refreshToken
    } = await this.generateClientTokens(userId, usernameForToken);
    this.saveTokens(accessToken, refreshToken);
    this.saveUser(user);
    return {
      success: true,
      data: {
        user: {
          id: userId,
          email: userEmail
        }
      }
    };
  },
  /**
   * Connexion utilisateur
   * - Si pas de secret JWT : tente d'abord le backend (compte local), puis le cloud
   * - Si secret JWT présent : tente le backend puis le cloud en secours
   */
  async login(email, password) {
    var _a2, _b, _c2, _d2, _e2, _f2, _g, _h;
    if (typeof window !== "undefined") {
      console.log("[server-api] Tentative de login:", {
        email,
        passwordLength: (password == null ? void 0 : password.length) || 0
      });
    }
    const hasJWTSecret = typeof window !== "undefined" && TokenManager.getJWTSecret() !== null;
    if (!hasJWTSecret) {
      console.log("[server-api] Aucun secret JWT, tentative de connexion au backend (compte local possible)...");
      const backendRes = await this.backendRequest("/api/client/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password
        })
      });
      if (backendRes.success && ((_a2 = backendRes.data) == null ? void 0 : _a2.user)) {
        const user3 = backendRes.data.user;
        const userId2 = user3.id || "";
        const username2 = user3.username || user3.email || email.split("@")[0] || "user";
        let secret = backendRes.data.jwt_secret;
        if (!secret && typeof crypto !== "undefined" && crypto.getRandomValues) {
          const arr = new Uint8Array(32);
          crypto.getRandomValues(arr);
          secret = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
        }
        if (secret) {
          TokenManager.setJWTSecret(secret);
        }
        const {
          accessToken: accessToken2,
          refreshToken: refreshToken2
        } = await this.generateClientTokens(userId2, username2);
        this.saveTokens(accessToken2, refreshToken2);
        this.saveUser({
          id: userId2,
          email: user3.email || email,
          username: username2
        });
        console.log("[server-api] Connexion backend (compte local) réussie");
        return {
          success: true,
          data: {
            user: {
              id: userId2,
              email: user3.email || email
            },
            accessToken: accessToken2,
            refreshToken: refreshToken2
          }
        };
      }
      console.log("[server-api] Backend échoué ou pas de compte local, connexion au cloud...");
      const cloudResponse = await this.loginCloud(email, password);
      if (!cloudResponse.success) {
        return cloudResponse;
      }
      const user2 = (_b = cloudResponse.data) == null ? void 0 : _b.user;
      if (user2) {
        const cloudAccessToken = ((_c2 = cloudResponse.data) == null ? void 0 : _c2.cloudAccessToken) || TokenManager.getCloudAccessToken();
        const cloudRefreshToken = ((_d2 = cloudResponse.data) == null ? void 0 : _d2.cloudRefreshToken) || TokenManager.getCloudRefreshToken();
        if (cloudAccessToken && cloudRefreshToken) {
          this.saveTokens(cloudAccessToken, cloudRefreshToken);
        }
        this.saveUser(user2);
        return {
          success: true,
          data: {
            user: {
              id: user2.id || "",
              email: user2.email || email
            },
            accessToken: cloudAccessToken || "",
            refreshToken: cloudRefreshToken || ""
          }
        };
      }
      return cloudResponse;
    }
    console.log("[server-api] Secret JWT présent, tentative de connexion au backend local...");
    const res = await this.backendRequest("/api/client/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password
      })
    });
    if (typeof window !== "undefined") {
      console.log("[server-api] Réponse login:", {
        success: res.success,
        error: res.error,
        message: res.message
      });
    }
    if (!res.success) {
      console.log("[server-api] Connexion locale échouée, tentative avec le cloud...");
      const cloudResponse = await this.loginCloud(email, password);
      if (cloudResponse.success) {
        const user2 = (_e2 = cloudResponse.data) == null ? void 0 : _e2.user;
        if (user2) {
          const cloudAccessToken = ((_f2 = cloudResponse.data) == null ? void 0 : _f2.cloudAccessToken) || TokenManager.getCloudAccessToken();
          const cloudRefreshToken = ((_g = cloudResponse.data) == null ? void 0 : _g.cloudRefreshToken) || TokenManager.getCloudRefreshToken();
          if (cloudAccessToken && cloudRefreshToken) {
            this.saveTokens(cloudAccessToken, cloudRefreshToken);
          }
          this.saveUser(user2);
          return {
            success: true,
            data: {
              user: {
                id: user2.id || "",
                email: user2.email || email
              },
              accessToken: cloudAccessToken || "",
              refreshToken: cloudRefreshToken || ""
            }
          };
        }
      }
      return res;
    }
    const user = ((_h = res.data) == null ? void 0 : _h.user) || res.data;
    const userId = (user == null ? void 0 : user.id) || "";
    const userEmail = (user == null ? void 0 : user.email) || email;
    const username = (user == null ? void 0 : user.username) || (email.split("@")[0] || email || "user").trim();
    const {
      accessToken,
      refreshToken
    } = await this.generateClientTokens(userId, username);
    this.saveTokens(accessToken, refreshToken);
    this.saveUser(user);
    return {
      success: true,
      data: {
        user: {
          id: userId,
          email: userEmail
        },
        accessToken,
        refreshToken
      }
    };
  },
  /**
   * Connexion avec compte cloud (popcorn-web)
   * Unifié : appel direct à popcorn-web pour tous les modes
   */
  async loginCloud(email, password) {
    var _a2, _b, _c2, _d2, _e2, _f2;
    try {
      const result = await loginCloud(email, password);
      if (!result) {
        return {
          success: false,
          error: "CloudUnavailable",
          message: "API cloud indisponible"
        };
      }
      if (result.requires2FA && result.tempToken) {
        return {
          success: true,
          data: {
            requires2FA: true,
            tempToken: result.tempToken,
            message: "Un code de vérification a été envoyé par email. Veuillez entrer ce code pour compléter la connexion."
          }
        };
      }
      console.log("[server-api] Stockage des tokens cloud...", {
        hasAccessToken: !!result.accessToken,
        hasRefreshToken: !!result.refreshToken,
        hasUser: !!result.user,
        hasJwtSecret: !!result.jwtSecret
      });
      TokenManager.setCloudTokens(result.accessToken, result.refreshToken);
      console.log("[server-api] Tokens cloud stockés");
      if (result.jwtSecret) {
        TokenManager.setJWTSecret(result.jwtSecret);
        console.log("[server-api] Secret JWT stocké depuis la connexion cloud");
      }
      console.log("[server-api] Sauvegarde de l'utilisateur...", {
        userId: (_a2 = result.user) == null ? void 0 : _a2.id,
        userEmail: (_b = result.user) == null ? void 0 : _b.email
      });
      this.saveUser(result.user);
      console.log("[server-api] Utilisateur sauvegardé");
      if (((_c2 = result.user) == null ? void 0 : _c2.id) && ((_d2 = result.user) == null ? void 0 : _d2.email)) {
        try {
          const username = result.user.username || result.user.email.split("@")[0];
          console.log("[server-api] Synchronisation de l'utilisateur cloud dans la base locale...", {
            userId: result.user.id,
            email: result.user.email,
            username
          });
          const syncResponse = await this.backendRequest("/api/client/auth/users/sync-cloud", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-User-ID": result.user.id
            },
            body: JSON.stringify({
              id: result.user.id,
              email: result.user.email,
              username,
              is_admin: result.user.is_admin
              // Inclure le statut admin si disponible
            })
          });
          if (syncResponse.success) {
            console.log("[server-api] ✅ Utilisateur cloud synchronisé dans la base locale avec succès");
          } else {
            console.warn("[server-api] ⚠️ Impossible de synchroniser l'utilisateur cloud:", syncResponse.message || syncResponse.error);
          }
        } catch (syncError) {
          console.error("[server-api] ❌ Erreur lors de la synchronisation de l'utilisateur cloud:", syncError);
        }
      } else {
        console.warn("[server-api] ⚠️ Informations utilisateur incomplètes, impossible de synchroniser:", {
          hasId: !!((_e2 = result.user) == null ? void 0 : _e2.id),
          hasEmail: !!((_f2 = result.user) == null ? void 0 : _f2.email)
        });
      }
      console.log("[server-api] Utilisation des tokens cloud pour les appels backend local");
      this.saveTokens(result.accessToken, result.refreshToken);
      console.log("[server-api] Tokens cloud sauvegardés comme tokens locaux");
      return {
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
          // Utiliser les tokens cloud directement
          refreshToken: result.refreshToken,
          cloudAccessToken: result.accessToken,
          cloudRefreshToken: result.refreshToken
        }
      };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      const errorName = e instanceof Error ? e.name : "UnknownError";
      console.error("[AUTH] Erreur lors de la connexion cloud:", {
        error: e,
        message: errorMessage,
        name: errorName,
        stack: e instanceof Error ? e.stack : void 0,
        errorString: JSON.stringify(e, Object.getOwnPropertyNames(e), 2)
      });
      let userMessage = "Erreur de connexion cloud";
      if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
        userMessage = "Email ou mot de passe incorrect";
      } else if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
        userMessage = "Le service cloud ne répond pas. Vérifiez votre connexion internet.";
      } else if (errorMessage.includes("network") || errorMessage.includes("fetch") || errorMessage.includes("Failed to fetch")) {
        userMessage = "Impossible de contacter le service cloud. Vérifiez votre connexion internet.";
      } else if (errorMessage) {
        userMessage = errorMessage;
      }
      return {
        success: false,
        error: "CloudLoginError",
        message: userMessage
      };
    }
  },
  /**
   * Inscription avec compte cloud (popcorn-web)
   */
  async registerCloud(email, password, inviteCode) {
    var _a2, _b;
    try {
      const result = await registerCloud(email, password, inviteCode);
      if (!result) {
        return {
          success: false,
          error: "CloudUnavailable",
          message: "API cloud indisponible"
        };
      }
      TokenManager.setCloudTokens(result.accessToken, result.refreshToken);
      if (result.jwtSecret) {
        TokenManager.setJWTSecret(result.jwtSecret);
      }
      this.saveUser(result.user);
      const userId = ((_a2 = result.user) == null ? void 0 : _a2.id) || "";
      const username = ((_b = result.user) == null ? void 0 : _b.email) || email;
      const {
        accessToken,
        refreshToken
      } = await this.generateClientTokens(userId, username);
      this.saveTokens(accessToken, refreshToken);
      return {
        success: true,
        data: {
          user: result.user,
          accessToken,
          refreshToken,
          cloudAccessToken: result.accessToken,
          cloudRefreshToken: result.refreshToken
        }
      };
    } catch (e) {
      return {
        success: false,
        error: "CloudRegisterError",
        message: e instanceof Error ? e.message : "Erreur d'inscription cloud"
      };
    }
  },
  /**
   * Déconnexion de l'utilisateur
   * Unifié : simple nettoyage local pour tous les modes
   */
  logout() {
    this.clearTokens();
    this.saveUser(null);
  },
  /**
   * Récupère les informations de l'utilisateur connecté
   * Unifié : lecture depuis localStorage pour tous les modes
   */
  async getMe() {
    const user = this.getUser();
    if (user == null ? void 0 : user.id) {
      return {
        success: true,
        data: {
          id: user.id,
          email: user.email || ""
        }
      };
    }
    return {
      success: false,
      error: "Unauthorized",
      message: "Non authentifié"
    };
  }
};
function toTmdbLanguage$1(lang) {
  if (!lang) return "fr-FR";
  if (lang.includes("-")) return lang;
  return lang === "fr" ? "fr-FR" : lang === "en" ? "en-US" : `${lang}-${lang.toUpperCase()}`;
}
const mediaMethods = {
  /**
   * Recherche de contenu
   * Unifié : appel direct au backend Rust.
   * Si connecté, envoie user_id pour persister les résultats indexeur en DB (comme le sync).
   */
  async search(params) {
    var _a2;
    const queryParams = new URLSearchParams();
    queryParams.set("q", params.q);
    if (params.type) queryParams.set("type", params.type);
    if (params.year) queryParams.set("year", params.year.toString());
    if (params.page) queryParams.set("page", params.page.toString());
    if (params.source) queryParams.set("source", params.source);
    const uid = (_a2 = params.user_id) != null ? _a2 : this.getCurrentUserId();
    if (uid) queryParams.set("user_id", uid);
    queryParams.set("lang", toTmdbLanguage$1(params.lang));
    const qp = queryParams.toString();
    return this.backendRequest(`/api/indexers/search?${qp}`, {
      method: "GET"
    });
  },
  /**
   * Récupère un torrent groupé par slug
   * Unifié : appel direct au backend Rust
   */
  async getTorrentGroup(slug) {
    return this.backendRequest(`/api/torrents/group/${encodeURIComponent(slug)}`, {
      method: "GET"
    });
  },
  /**
   * Récupère un groupe par tmdb_id (pour résultats recherche → détail).
   * Retourne un groupe vide si le média n'est pas encore synchronisé.
   */
  async getTorrentGroupByTmdbId(tmdbId, title) {
    const q = title ? `?title=${encodeURIComponent(title)}` : "";
    return this.backendRequest(`/api/torrents/group/by-tmdb/${tmdbId}${q}`, {
      method: "GET"
    });
  },
  /**
   * Récupère un torrent par ID
   * Unifié : appel direct au backend Rust
   */
  async getTorrentById(id) {
    return this.backendRequest(`/api/torrents/${encodeURIComponent(id)}`, {
      method: "GET"
    });
  },
  /**
   * Récupère les épisodes d'une série par slug (saisons et épisodes avec variantes)
   */
  async getSeriesEpisodes(slug) {
    return this.backendRequest(`/api/torrents/series/${encodeURIComponent(slug)}/episodes`, {
      method: "GET"
    });
  },
  /**
   * Récupère les épisodes d'une série locale par tmdb_id (médias de la bibliothèque)
   */
  async getSeriesEpisodesByTmdbId(tmdbId) {
    return this.backendRequest(`/api/torrents/series/by-tmdb/${tmdbId}/episodes`, {
      method: "GET"
    });
  },
  /**
   * Récupère l'URL de stream pour un contenu
   * Le contentId peut être un slug (ex: "une-zone-a-defendre-2023") ou un infoHash
   * Note: Cette méthode est conservée pour compatibilité avec VideoPlayer.tsx
   * Le nouveau système utilise MediaDetailPage avec le backend Rust
   */
  async getStream(contentId) {
    try {
      const baseUrl = this.getServerUrl();
      const groupResponse = await fetch(`${baseUrl}/api/torrents/group/${encodeURIComponent(contentId)}`, {
        headers: {
          "Authorization": `Bearer ${this.getAccessToken()}`
        }
      });
      if (groupResponse.ok) {
        const groupData = await groupResponse.json();
        if (groupData.success && groupData.data) {
          const variants = groupData.data.variants || [];
          if (variants.length > 0) {
            const firstVariant = variants[0];
            const infoHash = firstVariant.infoHash || firstVariant.info_hash;
            if (infoHash) {
              const hlsUrl2 = `${baseUrl}/api/media/hls/${infoHash}/master.m3u8`;
              return {
                success: true,
                data: {
                  streamUrl: hlsUrl2,
                  hlsUrl: hlsUrl2
                }
              };
            }
          }
        }
      }
      const hlsUrl = `${baseUrl}/api/media/hls/${contentId}/master.m3u8`;
      return {
        success: true,
        data: {
          streamUrl: hlsUrl,
          hlsUrl
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erreur lors de la récupération du stream"
      };
    }
  }
};
const LIBRARY_CACHE_TTL_MS = 45e3;
let libraryCache = null;
const libraryMethods = {
  /**
   * Récupère la bibliothèque de l'utilisateur
   * Envoie X-User-ID pour que le backend utilise la clé TMDB de l'utilisateur (enrichissement).
   * Utilise un cache client (TTL 45s) pour afficher rapidement l'onglet Bibliothèque.
   */
  async getLibrary() {
    const userId = this.getCurrentUserId();
    const cacheKey = userId != null ? userId : "";
    const now = Date.now();
    if (libraryCache && libraryCache.key === cacheKey && now - libraryCache.entry.at < LIBRARY_CACHE_TTL_MS) {
      return libraryCache.entry.data;
    }
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    const data = await this.backendRequest("/library", {
      method: "GET",
      headers
    });
    libraryCache = {
      key: cacheKey,
      entry: {
        data,
        at: now
      }
    };
    return data;
  },
  /**
   * Récupère la bibliothèque depuis une URL backend donnée (ex. "mon serveur" sur la page Bibliothèque).
   */
  async getLibraryFromBaseUrl(baseUrl) {
    const userId = this.getCurrentUserId();
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    const base = baseUrl.trim().replace(/\/$/, "");
    return this.backendRequest("/library", {
      method: "GET",
      headers
    }, 0, base);
  },
  /**
   * Récupère le statut de sync bibliothèque depuis une URL backend donnée.
   */
  async getLibrarySyncStatusFromBaseUrl(baseUrl) {
    const userId = this.getCurrentUserId();
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    const base = baseUrl.trim().replace(/\/$/, "");
    return this.backendRequest("/api/library/status", {
      method: "GET",
      headers
    }, 0, base);
  },
  /**
   * Ajoute un élément à la bibliothèque
   * Note: La bibliothèque est gérée localement, cette méthode peut être désactivée ou adaptée
   */
  async addToLibrary(contentId, title, type, encryptedData) {
    return {
      success: true,
      data: {
        id: contentId,
        contentId,
        title,
        type,
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  },
  /**
   * Supprime un élément de la bibliothèque
   */
  async removeFromLibrary(libraryId) {
    return {
      success: true
    };
  },
  /**
   * Récupère les favoris de l'utilisateur
   */
  async getFavorites() {
    return {
      success: true,
      data: []
    };
  },
  /**
   * Ajoute un favori
   */
  async addFavorite(contentId, encryptedData) {
    return {
      success: true,
      data: {
        id: contentId,
        contentId,
        title: "",
        type: "movie",
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  },
  /**
   * Supprime un favori
   * Note: Pas encore implémenté côté backend Rust
   */
  async removeFavorite(favoriteId) {
    return {
      success: true
    };
  },
  /**
   * Lance le scan et l'enrichissement des fichiers locaux
   */
  async scanLocalMedia() {
    const userId = this.getCurrentUserId();
    const url = userId ? `/api/library/scan?user_id=${encodeURIComponent(userId)}` : "/api/library/scan";
    return this.backendRequest(url, {
      method: "POST"
    });
  },
  /**
   * Indique si un scan bibliothèque est en cours et quelle source est en cours de scan
   */
  async getLibrarySyncStatus() {
    const userId = this.getCurrentUserId();
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    return this.backendRequest("/api/library/status", {
      method: "GET",
      headers
    });
  },
  // ---------- Sources de bibliothèque (dossiers externes : autre NAS, etc.) ----------
  async getLibrarySources() {
    return this.backendRequest("/api/library/sources", {
      method: "GET"
    });
  },
  async createLibrarySource(body) {
    return this.backendRequest("/api/library/sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  },
  async updateLibrarySource(id, body) {
    return this.backendRequest(`/api/library/sources/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  },
  async deleteLibrarySource(id) {
    return this.backendRequest(`/api/library/sources/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },
  async setLibrarySourceShare(id, share_with_friends) {
    return this.backendRequest(`/api/library/sources/${encodeURIComponent(id)}/share`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        share_with_friends
      })
    });
  },
  async setLibrarySourceEnabled(id, is_enabled) {
    return this.backendRequest(`/api/library/sources/${encodeURIComponent(id)}/enabled`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        is_enabled
      })
    });
  },
  async scanLibrarySource(id) {
    const userId = this.getCurrentUserId();
    const url = userId ? `/api/library/sources/${encodeURIComponent(id)}/scan?user_id=${encodeURIComponent(userId)}` : `/api/library/sources/${encodeURIComponent(id)}/scan`;
    return this.backendRequest(url, {
      method: "POST"
    });
  },
  /** Liste tous les médias indexés (local_media) pour la gestion dans Paramètres > Bibliothèque */
  async getLibraryMedia() {
    return this.backendRequest("/api/library/media", {
      method: "GET"
    });
  },
  /** Met à jour le chemin d'un média (ne déplace pas le fichier sur disque) */
  async updateLibraryMedia(id, file_path) {
    return this.backendRequest(`/api/library/media/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file_path
      })
    });
  },
  /** Supprime un média de la base (ne supprime pas le fichier sur disque) */
  async deleteLibraryMedia(id) {
    return this.backendRequest(`/api/library/media/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },
  /** Supprime le fichier sur disque puis l'entrée en base (répertoire de téléchargement local uniquement) */
  async deleteLibraryMediaFile(id) {
    return this.backendRequest(`/api/library/media/${encodeURIComponent(id)}/file`, {
      method: "DELETE"
    });
  }
};
const healthMethods = {
  /**
   * Vérifie la santé du serveur avec détails
   * Retourne des informations détaillées sur l'état de la connexion et la version
   */
  async checkServerHealth() {
    const startTime = Date.now();
    const res = await this.backendRequest("/api/client/health", {
      method: "GET"
    });
    const latency = Date.now() - startTime;
    if (!res.success) {
      const isConnectionError = res.error === "ConnectionError" || res.error === "Timeout" || res.error === "NetworkError";
      let errorMessage = res.message;
      if (isConnectionError) {
        const isAndroid = typeof window !== "undefined" && /Android/i.test(navigator.userAgent || "");
        if (isAndroid) {
          errorMessage = "Le backend n'est pas accessible.\n\nSur Android:\n• Vérifiez que l'IP est correcte (pas 10.0.2.2 sur appareil physique)\n• Utilisez l'IP locale de votre machine (ex: http://192.168.1.100:3000)\n• Assurez-vous que votre mobile et votre PC sont sur le même réseau Wi-Fi\n• Vérifiez que le backend Rust est démarré";
        } else {
          errorMessage = "Le backend n'est pas accessible. Vérifiez que le serveur est démarré et que l'URL est correcte.";
        }
      }
      return {
        success: false,
        error: res.error,
        message: errorMessage,
        data: {
          status: "error",
          reachable: false,
          latency
        }
      };
    }
    const backendData = res.data || {};
    return {
      success: true,
      data: {
        status: "ok",
        reachable: true,
        latency,
        version: backendData.version,
        build: backendData.build,
        download_dir: backendData.download_dir,
        ffmpeg_available: backendData.ffmpeg_available,
        torrent_client_reachable: backendData.torrent_client_reachable,
        librqbit_version: backendData.librqbit_version,
        flaresolverr_configured: backendData.flaresolverr_configured
      }
    };
  },
  /**
   * Récupère les statistiques de stockage (utilisé / total / disponible).
   */
  async getStorageStats() {
    return this.backendRequest("/api/client/storage", {
      method: "GET"
    });
  },
  /**
   * Met à jour le délai de rétention des torrents (abonnement streaming).
   * @param storageRetentionDays Nombre de jours avant suppression auto, null = garder indéfiniment, 0 = supprimer après lecture.
   */
  async patchStorageRetention(storageRetentionDays) {
    return this.backendRequest("/api/client/storage/retention", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        storage_retention_days: storageRetentionDays
      })
    });
  },
  /**
   * Vérifie rapidement si le backend est accessible (pour le démarrage de l'app)
   * Version optimisée avec timeout court pour éviter les ANR sur Android
   */
  async quickHealthCheck() {
    try {
      const res = await this.backendRequest("/api/client/health", {
        method: "GET"
      });
      return res.success;
    } catch (e) {
      return false;
    }
  },
  /**
   * Récupère le statut du setup
   */
  async getSetupStatus() {
    var _a2, _b;
    const healthRes = await this.backendRequest("/api/client/health", {
      method: "GET"
    });
    const backendReachable = healthRes.success;
    if (!backendReachable) {
      return {
        success: true,
        data: {
          needsSetup: false,
          hasUsers: false,
          hasIndexers: false,
          hasBackendConfig: true,
          hasTmdbKey: false,
          hasTorrents: false,
          hasDownloadLocation: false,
          backendReachable: false
        }
      };
    }
    const usersCount = await this.backendRequest("/api/client/auth/users/count", {
      method: "GET"
    });
    const hasUsers = usersCount.success ? typeof usersCount.data === "number" ? usersCount.data > 0 : false : false;
    const indexersRes = await this.backendRequest("/api/client/admin/indexers", {
      method: "GET"
    });
    const hasIndexers = indexersRes.success ? Array.isArray(indexersRes.data) ? indexersRes.data.some((i) => (i == null ? void 0 : i.is_enabled) === 1 || (i == null ? void 0 : i.is_enabled) === true) : false : false;
    const downloadLocation = PreferencesManager.getDownloadLocation();
    const hasDownloadLocation = !!(downloadLocation && downloadLocation.trim());
    let hasTmdbKey = false;
    const userId = this.getCurrentUserId();
    if (userId) {
      const tmdbRes = await this.backendRequest("/api/tmdb/key", {
        method: "GET",
        headers: {
          "X-User-ID": userId
        }
      });
      hasTmdbKey = tmdbRes.success && (((_a2 = tmdbRes.data) == null ? void 0 : _a2.has_key) === true || ((_b = tmdbRes.data) == null ? void 0 : _b.has_key) === 1);
    }
    const needsSetup = !hasUsers;
    return {
      success: true,
      data: {
        needsSetup,
        hasUsers,
        hasIndexers,
        hasBackendConfig: true,
        hasTmdbKey,
        hasTorrents: false,
        hasDownloadLocation,
        backendReachable: true
      }
    };
  },
  /**
   * Teste si FlareSolverr est joigniable et fonctionnel (côté serveur).
   */
  async testFlareSolverr() {
    return this.backendRequest("/api/client/flaresolverr/test", {
      method: "GET"
    });
  }
};
const indexersMethods = {
  async getIndexers() {
    const res = await this.backendRequest("/api/client/admin/indexers", {
      method: "GET"
    });
    if (!res.success) return res;
    const indexers = (Array.isArray(res.data) ? res.data : []).map((idx) => ({
      id: idx.id,
      name: idx.name,
      baseUrl: idx.base_url,
      apiKey: idx.api_key || null,
      jackettIndexerName: idx.jackett_indexer_name || null,
      isEnabled: idx.is_enabled === 1 || idx.is_enabled === true,
      isDefault: idx.is_default === 1 || idx.is_default === true,
      priority: idx.priority || 0,
      fallbackIndexerId: idx.fallback_indexer_id || null,
      indexerTypeId: idx.indexer_type_id || null,
      configJson: idx.config_json || null
    }));
    return {
      success: true,
      data: indexers
    };
  },
  async getIndexerTypes() {
    return this.backendRequest("/api/admin/indexers/types", {
      method: "GET"
    });
  },
  async createIndexer(data) {
    var _a2, _b;
    const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
    const payload = {
      id,
      name: data.name,
      base_url: data.baseUrl,
      api_key: data.apiKey || null,
      jackett_indexer_name: data.jackettIndexerName || null,
      is_enabled: data.isEnabled,
      is_default: data.isDefault,
      priority: data.priority,
      indexer_type_id: data.indexerTypeId || null,
      config_json: data.configJson || null
    };
    const res = await this.backendRequest("/api/client/admin/indexers", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (!res.success) return res;
    const idx = res.data;
    return {
      success: true,
      data: {
        id: idx.id || id,
        name: idx.name || data.name,
        baseUrl: idx.base_url || data.baseUrl,
        apiKey: idx.api_key || data.apiKey || null,
        jackettIndexerName: idx.jackett_indexer_name || data.jackettIndexerName || null,
        isEnabled: idx.is_enabled === 1 || idx.is_enabled === true || data.isEnabled,
        isDefault: idx.is_default === 1 || idx.is_default === true || data.isDefault,
        priority: (_b = (_a2 = idx.priority) != null ? _a2 : data.priority) != null ? _b : 0,
        fallbackIndexerId: idx.fallback_indexer_id || null,
        indexerTypeId: idx.indexer_type_id || data.indexerTypeId || null,
        configJson: idx.config_json || data.configJson || null
      }
    };
  },
  async updateIndexer(id, data) {
    var _a2, _b, _c2, _d2, _e2;
    const payload = {
      id,
      name: (_a2 = data.name) != null ? _a2 : "",
      base_url: (_b = data.baseUrl) != null ? _b : "",
      api_key: data.apiKey !== void 0 ? data.apiKey || null : null,
      jackett_indexer_name: data.jackettIndexerName !== void 0 ? data.jackettIndexerName || null : null,
      is_enabled: (_c2 = data.isEnabled) != null ? _c2 : true,
      is_default: (_d2 = data.isDefault) != null ? _d2 : false,
      priority: (_e2 = data.priority) != null ? _e2 : 0,
      indexer_type_id: data.indexerTypeId !== void 0 ? data.indexerTypeId || null : null,
      config_json: data.configJson !== void 0 ? data.configJson || null : null
    };
    const res = await this.backendRequest(`/api/client/admin/indexers/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    if (!res.success) return res;
    const idx = res.data;
    return {
      success: true,
      data: {
        id: idx.id || id,
        name: idx.name,
        baseUrl: idx.base_url,
        apiKey: idx.api_key || null,
        jackettIndexerName: idx.jackett_indexer_name || null,
        isEnabled: idx.is_enabled === 1 || idx.is_enabled === true,
        isDefault: idx.is_default === 1 || idx.is_default === true,
        priority: idx.priority || 0,
        fallbackIndexerId: idx.fallback_indexer_id || null,
        indexerTypeId: idx.indexer_type_id || null,
        configJson: idx.config_json || null
      }
    };
  },
  async deleteIndexer(id) {
    return this.backendRequest(`/api/client/admin/indexers/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },
  async getIndexerCategories(indexerId) {
    return this.backendRequest(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories`, {
      method: "GET"
    });
  },
  async updateIndexerCategories(indexerId, categories) {
    if (Array.isArray(categories)) {
      return this.backendRequest(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories`, {
        method: "PUT",
        body: JSON.stringify({
          categories
        })
      });
    } else {
      return this.backendRequest(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories`, {
        method: "PUT",
        body: JSON.stringify({
          categories_config: categories
        })
      });
    }
  },
  async getIndexerAvailableCategories(indexerId) {
    return this.backendRequest(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories/available`, {
      method: "GET"
    });
  },
  async getTmdbGenres() {
    const userId = this.getCurrentUserId();
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    return this.backendRequest("/api/admin/indexers/tmdb-genres", {
      method: "GET",
      headers
    });
  },
  async testIndexer(id) {
    return this.backendRequest(`/api/indexers/test`, {
      method: "POST",
      body: JSON.stringify({
        indexer_id: id
      })
    });
  },
  async testIndexerStream(id, onProgress) {
    var _a2, _b;
    const base = this.getBackendBaseUrl();
    const url = `${base}/api/indexers/test-stream`;
    const res = await this.nativeFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        indexer_id: id
      })
    }, 6e4);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data && typeof data === "object" && typeof data.error === "string" ? data.error : `Erreur ${res.status}`;
      return {
        success: false,
        error: "BackendError",
        message: msg
      };
    }
    const reader = (_a2 = res.body) == null ? void 0 : _a2.getReader();
    if (!reader) return {
      success: false,
      error: "BackendError",
      message: "Pas de flux"
    };
    const dec = new TextDecoder();
    let buf = "";
    let finalData = null;
    function processBlock(block) {
      const m = block.match(/^data:\s*(.+)$/m);
      if (!m) return;
      try {
        const event = JSON.parse(m[1].trim());
        if ((event.type === "query_done" || event.type === "api_key_test_done") && onProgress) onProgress(event);
        if (event.type === "complete") finalData = event;
      } catch (_) {
      }
    }
    try {
      for (; ; ) {
        const {
          done,
          value
        } = await reader.read();
        if (done) break;
        buf += dec.decode(value, {
          stream: true
        });
        const lines = buf.split("\n\n");
        buf = (_b = lines.pop()) != null ? _b : "";
        for (const block of lines) processBlock(block);
      }
      if (buf.trim()) processBlock(buf);
    } finally {
      reader.releaseLock();
    }
    if (finalData) {
      return {
        success: true,
        data: {
          success: finalData.success,
          message: finalData.message,
          totalResults: finalData.totalResults,
          resultsCount: finalData.resultsCount,
          successfulQueries: finalData.successfulQueries,
          failedQueries: finalData.failedQueries,
          testQueries: finalData.testQueries,
          sampleResults: finalData.sampleResults,
          apiKeyTest: finalData.apiKeyTest,
          downloadTest: finalData.downloadTest
        }
      };
    }
    return {
      success: false,
      error: "BackendError",
      message: "Test incomplet"
    };
  }
};
function isTmdbKeyMaskedOrInvalid(key) {
  if (key == null || typeof key !== "string") return true;
  const cleaned = key.trim().replace(/\s+/g, "");
  if (!cleaned) return true;
  if (cleaned.length < 10) return true;
  if (cleaned === "***" || cleaned === "****") return true;
  if (cleaned.includes("*") || cleaned.includes("...")) return true;
  return false;
}
const settingsMethods = {
  async getTmdbKey() {
    var _a2, _b, _c2;
    const userId = this.getCurrentUserId();
    if (!userId) {
      return {
        success: true,
        data: {
          apiKey: null,
          hasKey: false
        }
      };
    }
    const res = await this.backendRequest("/api/tmdb/key", {
      method: "GET",
      headers: {
        "X-User-ID": userId
      }
    });
    if (!res.success) return res;
    const hasKey = ((_a2 = res.data) == null ? void 0 : _a2.has_key) === true || ((_b = res.data) == null ? void 0 : _b.has_key) === 1;
    const maskedKey = (_c2 = res.data) == null ? void 0 : _c2.masked_key;
    return {
      success: true,
      data: {
        apiKey: maskedKey || null,
        hasKey
      }
    };
  },
  async getTmdbKeyExport() {
    var _a2, _b, _c2;
    const userId = this.getCurrentUserId();
    if (!userId) {
      return {
        success: true,
        data: {
          apiKey: null,
          hasKey: false
        }
      };
    }
    const res = await this.backendRequest("/api/tmdb/key/export", {
      method: "GET",
      headers: {
        "X-User-ID": userId
      }
    });
    if (!res.success) return res;
    const hasKey = ((_a2 = res.data) == null ? void 0 : _a2.has_key) === true || ((_b = res.data) == null ? void 0 : _b.has_key) === 1;
    const apiKey = (_c2 = res.data) == null ? void 0 : _c2.api_key;
    return {
      success: true,
      data: {
        apiKey: apiKey || null,
        hasKey
      }
    };
  },
  async saveTmdbKey(key) {
    var _a2, _b, _c2;
    const userId = this.getCurrentUserId();
    if (!userId) {
      return {
        success: false,
        error: "Unauthorized",
        message: "Connecte-toi avant de configurer TMDB."
      };
    }
    const cleanedKey = key.trim().replace(/\s+/g, "");
    if (!cleanedKey) {
      return {
        success: false,
        error: "ValidationError",
        message: "La clé API TMDB ne peut pas être vide"
      };
    }
    if (isTmdbKeyMaskedOrInvalid(cleanedKey)) {
      return {
        success: false,
        error: "ValidationError",
        message: "Clé masquée ou invalide. Entrez la clé complète (32 caractères) depuis https://www.themoviedb.org/settings/api"
      };
    }
    const keyPreview = cleanedKey.length > 8 ? `${cleanedKey.substring(0, 4)}...${cleanedKey.substring(cleanedKey.length - 4)}` : "****";
    console.log(`[TMDB] Sauvegarde clé TMDB (longueur: ${cleanedKey.length}, preview: ${keyPreview})`);
    const res = await this.backendRequest("/api/tmdb/key", {
      method: "POST",
      headers: {
        "X-User-ID": userId
      },
      body: JSON.stringify({
        api_key: cleanedKey
      })
    });
    if (!res.success) {
      if (((_a2 = res.message) == null ? void 0 : _a2.includes("invalide")) || ((_b = res.message) == null ? void 0 : _b.includes("401")) || ((_c2 = res.message) == null ? void 0 : _c2.includes("403"))) {
        return {
          success: false,
          error: res.error || "ValidationError",
          message: res.message || `La clé API TMDB est invalide. Vérifiez qu'il s'agit bien d'une clé v3 "API Key" (32 caractères) depuis https://www.themoviedb.org/settings/api`
        };
      }
      return res;
    }
    return {
      success: true
    };
  },
  async deleteTmdbKey() {
    const userId = this.getCurrentUserId();
    if (!userId) return {
      success: true
    };
    const res = await this.backendRequest("/api/tmdb/key", {
      method: "DELETE",
      headers: {
        "X-User-ID": userId
      }
    });
    if (!res.success) return res;
    return {
      success: true
    };
  },
  async testTmdbKey() {
    var _a2, _b;
    const userId = this.getCurrentUserId();
    if (!userId) return {
      success: true,
      data: {
        valid: false,
        message: "Non authentifiÃ©"
      }
    };
    const hasKeyRes = await this.backendRequest("/api/tmdb/key", {
      method: "GET",
      headers: {
        "X-User-ID": userId
      }
    });
    if (!hasKeyRes.success) return hasKeyRes;
    const hasKey = ((_a2 = hasKeyRes.data) == null ? void 0 : _a2.has_key) === true || ((_b = hasKeyRes.data) == null ? void 0 : _b.has_key) === 1;
    return {
      success: true,
      data: {
        valid: !!hasKey,
        message: hasKey ? void 0 : "ClÃ© TMDB non configurÃ©e"
      }
    };
  },
  async getClientTorrentConfig() {
    return this.backendRequest("/api/admin/client-torrent/config", {
      method: "GET"
    });
  },
  /** GET /api/client/config/media-paths — chemins par type (films, séries), style Jellyfin */
  async getMediaPaths() {
    return this.backendRequest("/api/client/config/media-paths", {
      method: "GET"
    });
  },
  /** PUT /api/client/config/media-paths — met à jour les chemins (relatifs à download_dir_root) */
  async putMediaPaths(body) {
    return this.backendRequest("/api/client/config/media-paths", {
      method: "PUT",
      body: JSON.stringify(body)
    });
  },
  /** GET /api/explorer/files — liste dossiers/fichiers (path optionnel, relatif à download_dir) */
  async listExplorerFiles(path) {
    const url = path != null && path !== "" ? `/api/explorer/files?path=${encodeURIComponent(path)}` : "/api/explorer/files";
    return this.backendRequest(url, {
      method: "GET"
    });
  },
  /** GET /api/library/sources/explorer — explorateur complet pour choisir une source de bibliothèque */
  async listLibrarySourceExplorerFiles(path) {
    const url = path != null && path !== "" ? `/api/library/sources/explorer?path=${encodeURIComponent(path)}` : "/api/library/sources/explorer";
    return this.backendRequest(url, {
      method: "GET"
    });
  }
};
const syncMethods = {
  async getSyncStatus() {
    const userId = this.getCurrentUserId();
    if (!userId) return {
      success: false,
      error: "Unauthorized",
      message: "Connecte-toi avant la sync."
    };
    return this.backendRequest(`/api/sync/status?user_id=${encodeURIComponent(userId)}`, {
      method: "GET"
    });
  },
  async startSync(indexerIds) {
    const userId = this.getCurrentUserId();
    if (!userId) return {
      success: false,
      error: "Unauthorized",
      message: "Connecte-toi avant la sync."
    };
    const body = {
      user_id: userId
    };
    if (indexerIds !== void 0) {
      const ids = Array.isArray(indexerIds) ? indexerIds : [indexerIds];
      if (ids.length > 0) body.indexer_ids = ids;
    }
    return this.backendRequest("/api/sync/start", {
      method: "POST",
      body: JSON.stringify(body)
    });
  },
  async stopSync() {
    return this.backendRequest("/api/sync/reset", {
      method: "POST"
    });
  },
  async getSyncSettings() {
    return this.backendRequest("/api/sync/settings", {
      method: "GET"
    });
  },
  async updateSyncSettings(settings2) {
    const payload = {};
    if ((settings2 == null ? void 0 : settings2.sync_frequency_minutes) !== void 0) payload.sync_frequency_minutes = settings2.sync_frequency_minutes;
    else if ((settings2 == null ? void 0 : settings2.syncFrequencyMinutes) !== void 0) payload.sync_frequency_minutes = settings2.syncFrequencyMinutes;
    if ((settings2 == null ? void 0 : settings2.is_enabled) !== void 0) payload.is_enabled = settings2.is_enabled;
    else if ((settings2 == null ? void 0 : settings2.isEnabled) !== void 0) payload.is_enabled = settings2.isEnabled;
    if ((settings2 == null ? void 0 : settings2.max_torrents_per_category) !== void 0) payload.max_torrents_per_category = settings2.max_torrents_per_category;
    else if ((settings2 == null ? void 0 : settings2.maxTorrentsPerCategory) !== void 0) payload.max_torrents_per_category = settings2.maxTorrentsPerCategory;
    if ((settings2 == null ? void 0 : settings2.rss_incremental_enabled) !== void 0) payload.rss_incremental_enabled = settings2.rss_incremental_enabled;
    else if ((settings2 == null ? void 0 : settings2.rssIncrementalEnabled) !== void 0) payload.rss_incremental_enabled = settings2.rssIncrementalEnabled;
    if ((settings2 == null ? void 0 : settings2.sync_queries_films) !== void 0) payload.sync_queries_films = settings2.sync_queries_films;
    else if ((settings2 == null ? void 0 : settings2.syncQueriesFilms) !== void 0) payload.sync_queries_films = settings2.syncQueriesFilms;
    if ((settings2 == null ? void 0 : settings2.sync_queries_series) !== void 0) payload.sync_queries_series = settings2.sync_queries_series;
    else if ((settings2 == null ? void 0 : settings2.syncQueriesSeries) !== void 0) payload.sync_queries_series = settings2.syncQueriesSeries;
    return this.backendRequest("/api/sync/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  async clearSyncTorrents() {
    const userId = this.getCurrentUserId();
    if (!userId) return {
      success: false,
      error: "Unauthorized",
      message: "Connecte-toi avant la sync."
    };
    return this.backendRequest("/api/sync/clear-torrents", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId
      })
    });
  },
  /** Debug : vérifie si un torrent est réellement téléchargeable (GET + Range, premier octet bencode). */
  async checkTorrentDownload(indexerId, torrentId) {
    return this.backendRequest(`/api/debug/check-torrent-download?indexer_id=${encodeURIComponent(indexerId)}&torrent_id=${encodeURIComponent(torrentId)}`, {
      method: "GET"
    });
  }
};
function toTmdbLanguage(lang) {
  if (!lang) return "fr-FR";
  if (lang.includes("-")) return lang;
  return lang === "fr" ? "fr-FR" : lang === "en" ? "en-US" : `${lang}-${lang.toUpperCase()}`;
}
function toContentItem(raw) {
  var _a2, _b, _c2, _d2, _e2, _f2, _g;
  const id = (raw == null ? void 0 : raw.slug) || (raw == null ? void 0 : raw.id) || (raw == null ? void 0 : raw.infoHash) || (raw == null ? void 0 : raw.info_hash) || "";
  const type = (raw == null ? void 0 : raw.tmdbType) === "tv" || (raw == null ? void 0 : raw.tmdb_type) === "tv" || (raw == null ? void 0 : raw.category) === "SERIES" ? "tv" : "movie";
  const title = (raw == null ? void 0 : raw.cleanTitle) || (raw == null ? void 0 : raw.clean_title) || (raw == null ? void 0 : raw.name) || "";
  const poster = (raw == null ? void 0 : raw.imageUrl) || (raw == null ? void 0 : raw.image_url) || (raw == null ? void 0 : raw.poster_url) || void 0;
  const backdrop = (raw == null ? void 0 : raw.heroImageUrl) || (raw == null ? void 0 : raw.hero_image_url) || void 0;
  const logo = (raw == null ? void 0 : raw.logoUrl) || (raw == null ? void 0 : raw.logo_url) || void 0;
  const overview = (raw == null ? void 0 : raw.synopsis) || (raw == null ? void 0 : raw.overview) || void 0;
  const rating = typeof (raw == null ? void 0 : raw.voteAverage) === "number" ? raw.voteAverage : raw == null ? void 0 : raw.vote_average;
  const releaseDate = (raw == null ? void 0 : raw.releaseDate) || (raw == null ? void 0 : raw.release_date) || void 0;
  const genres = Array.isArray(raw == null ? void 0 : raw.genres) ? raw.genres : void 0;
  const seeds = (_a2 = raw == null ? void 0 : raw.seedCount) != null ? _a2 : raw == null ? void 0 : raw.seed_count;
  const peers = (_b = raw == null ? void 0 : raw.leechCount) != null ? _b : raw == null ? void 0 : raw.leech_count;
  const indexerName = (_d2 = (_c2 = raw == null ? void 0 : raw.indexerName) != null ? _c2 : raw == null ? void 0 : raw.indexer_name) != null ? _d2 : raw == null ? void 0 : raw.uploader;
  const codecRaw = ((raw == null ? void 0 : raw.codec) || ((_e2 = raw == null ? void 0 : raw.quality) == null ? void 0 : _e2.codec) || "").toString().toLowerCase();
  const codec = codecRaw.includes("265") ? "x265" : codecRaw.includes("264") ? "x264" : codecRaw.includes("av1") ? "AV1" : void 0;
  const resRaw = (((_f2 = raw == null ? void 0 : raw.quality) == null ? void 0 : _f2.resolution) || (raw == null ? void 0 : raw.resolution) || (raw == null ? void 0 : raw.quality) || "").toString().toLowerCase();
  const quality = resRaw.includes("remux") ? "Remux" : resRaw.includes("2160") || resRaw.includes("4k") ? "4K" : resRaw.includes("1080") ? "1080p" : resRaw.includes("720") ? "720p" : resRaw.includes("480") ? "480p" : void 0;
  const fileSize = (_g = raw == null ? void 0 : raw.fileSize) != null ? _g : raw == null ? void 0 : raw.file_size;
  const item = {
    id,
    title,
    type,
    poster,
    backdrop,
    logo,
    overview,
    rating: typeof rating === "number" ? rating : void 0,
    releaseDate,
    genres,
    tmdbId: typeof (raw == null ? void 0 : raw.tmdbId) === "number" ? raw.tmdbId : typeof (raw == null ? void 0 : raw.tmdb_id) === "number" ? raw.tmdb_id : null,
    seeds: typeof seeds === "number" ? seeds : void 0,
    peers: typeof peers === "number" ? peers : void 0,
    indexerName: typeof indexerName === "string" && indexerName.trim() ? indexerName.trim() : void 0,
    codec,
    quality,
    fileSize: typeof fileSize === "number" ? fileSize : void 0
  };
  if (type === "tv") {
    item.firstAirDate = releaseDate;
  }
  return item;
}
const dashboardMethods = {
  /**
   * Phase 1 (prioritaire) : films et séries populaires pour Hero + carousels populaires
   * Affiche la page dès réception pour un chargement perçu plus rapide
   */
  async getDashboardDataPhase1(language, options) {
    var _a2, _b, _c2, _d2;
    const minSeeds = (_a2 = options == null ? void 0 : options.minSeeds) != null ? _a2 : 0;
    const popularLimit = (_b = options == null ? void 0 : options.popularLimit) != null ? _b : 50;
    const mediaLanguages = (_c2 = options == null ? void 0 : options.mediaLanguages) != null ? _c2 : [];
    const minQuality = (_d2 = options == null ? void 0 : options.minQuality) != null ? _d2 : "";
    const lang = toTmdbLanguage(language);
    const langParam = mediaLanguages.length > 0 ? `&media_languages=${encodeURIComponent(mediaLanguages.join(","))}` : "";
    const qualParam = minQuality ? `&min_quality=${encodeURIComponent(minQuality)}` : "";
    const filterSuffix = `${langParam}${qualParam}`;
    try {
      const [moviesRes, seriesRes] = await Promise.all([this.backendRequest(`/api/torrents/list?category=films&sort=popular&limit=${popularLimit}&page=1&skip_indexer=true&lang=${lang}&min_seeds=${minSeeds}${filterSuffix}`, {
        method: "GET"
      }), this.backendRequest(`/api/torrents/list?category=series&sort=popular&limit=${popularLimit}&page=1&skip_indexer=true&lang=${lang}&min_seeds=${minSeeds}${filterSuffix}`, {
        method: "GET"
      })]);
      if (!moviesRes.success && !seriesRes.success) {
        return {
          success: false,
          error: moviesRes.error || seriesRes.error || "BackendError",
          message: moviesRes.message || seriesRes.message || "Erreur lors du chargement du dashboard"
        };
      }
      const movies = Array.isArray(moviesRes.data) ? moviesRes.data.map(toContentItem).filter((i) => i.id) : [];
      const series = Array.isArray(seriesRes.data) ? seriesRes.data.map(toContentItem).filter((i) => i.id) : [];
      const heroCandidate = [...movies, ...series].find((i) => i.backdrop || i.poster) || movies[0] || series[0];
      const dashboard2 = {
        hero: heroCandidate ? {
          id: heroCandidate.id,
          title: heroCandidate.title,
          overview: heroCandidate.overview,
          poster: heroCandidate.poster,
          backdrop: heroCandidate.backdrop,
          type: heroCandidate.type,
          releaseDate: heroCandidate.releaseDate,
          rating: heroCandidate.rating
        } : void 0,
        continueWatching: [],
        popularMovies: movies.slice(0, 50),
        popularSeries: series.slice(0, 50),
        recentAdditions: [],
        fastTorrents: []
      };
      return {
        success: true,
        data: dashboard2
      };
    } catch (e) {
      return {
        success: false,
        error: "DashboardError",
        message: e instanceof Error ? e.message : "Erreur lors du chargement du dashboard"
      };
    }
  },
  /**
   * Phase 2 (secondaire) : ajouts récents et torrents rapides
   * À appeler en parallèle ou après la phase 1
   */
  async getDashboardDataPhase2(language, options) {
    var _a2, _b, _c2, _d2, _e2, _f2;
    const minSeeds = (_a2 = options == null ? void 0 : options.minSeeds) != null ? _a2 : 0;
    const recentLimit = (_b = options == null ? void 0 : options.recentLimit) != null ? _b : 80;
    const mediaLanguages = (_c2 = options == null ? void 0 : options.mediaLanguages) != null ? _c2 : [];
    const minQuality = (_d2 = options == null ? void 0 : options.minQuality) != null ? _d2 : "";
    const popularMovieIds = new Set((_e2 = options == null ? void 0 : options.popularMovieIds) != null ? _e2 : []);
    const popularSeriesIds = new Set((_f2 = options == null ? void 0 : options.popularSeriesIds) != null ? _f2 : []);
    const lang = toTmdbLanguage(language);
    const langParam = mediaLanguages.length > 0 ? `&media_languages=${encodeURIComponent(mediaLanguages.join(","))}` : "";
    const qualParam = minQuality ? `&min_quality=${encodeURIComponent(minQuality)}` : "";
    const filterSuffix = `${langParam}${qualParam}`;
    try {
      const [recentMoviesRes, recentSeriesRes, fastTorrentsRes] = await Promise.all([this.backendRequest(`/api/torrents/list?category=films&sort=recent&limit=${recentLimit}&page=1&skip_indexer=true&lang=${lang}&min_seeds=${minSeeds}${filterSuffix}`, {
        method: "GET"
      }), this.backendRequest(`/api/torrents/list?category=series&sort=recent&limit=${recentLimit}&page=1&skip_indexer=true&lang=${lang}&min_seeds=${minSeeds}${filterSuffix}`, {
        method: "GET"
      }), this.backendRequest(`/api/torrents/fast?limit=20&min_seeds=50&lang=${lang}`, {
        method: "GET"
      })]);
      const recentMovies = Array.isArray(recentMoviesRes.data) ? recentMoviesRes.data.map(toContentItem).filter((i) => i.id) : [];
      const recentSeries = Array.isArray(recentSeriesRes.data) ? recentSeriesRes.data.map(toContentItem).filter((i) => i.id) : [];
      const fastTorrents = Array.isArray(fastTorrentsRes.data) ? fastTorrentsRes.data.map(toContentItem).filter((i) => i.id) : [];
      const recentMoviesFiltered = recentMovies.filter((m) => !popularMovieIds.has(m.id)).slice(0, 25);
      const recentSeriesFiltered = recentSeries.filter((s) => !popularSeriesIds.has(s.id)).slice(0, 25);
      const recentAdditions = [...recentMoviesFiltered, ...recentSeriesFiltered];
      return {
        success: true,
        data: {
          recentAdditions,
          fastTorrents: fastTorrents.slice(0, 40)
        }
      };
    } catch (e) {
      return {
        success: false,
        error: "DashboardError",
        message: e instanceof Error ? e.message : "Erreur lors du chargement des données secondaires"
      };
    }
  },
  /**
  /**
   * Récupère les données du dashboard
   * @param language - Code de langue optionnel (ex: 'fr', 'en', 'fr-FR', 'en-US')
   * @param options - minSeeds (0=tout, 1=exclure 0 seed), limits pour popular/recent
   */
  async getDashboardData(language, options) {
    var _a2, _b, _c2, _d2, _e2;
    const minSeeds = (_a2 = options == null ? void 0 : options.minSeeds) != null ? _a2 : 0;
    const popularLimit = (_b = options == null ? void 0 : options.popularLimit) != null ? _b : 50;
    const recentLimit = (_c2 = options == null ? void 0 : options.recentLimit) != null ? _c2 : 80;
    const mediaLanguages = (_d2 = options == null ? void 0 : options.mediaLanguages) != null ? _d2 : [];
    const minQuality = (_e2 = options == null ? void 0 : options.minQuality) != null ? _e2 : "";
    const lang = toTmdbLanguage(language);
    const langParam = mediaLanguages.length > 0 ? `&media_languages=${encodeURIComponent(mediaLanguages.join(","))}` : "";
    const qualParam = minQuality ? `&min_quality=${encodeURIComponent(minQuality)}` : "";
    const filterSuffix = `${langParam}${qualParam}`;
    try {
      const [moviesRes, seriesRes, recentMoviesRes, recentSeriesRes, fastTorrentsRes] = await Promise.all([(async () => {
        const res = await this.backendRequest(`/api/torrents/list?category=films&sort=popular&limit=${popularLimit}&page=1&skip_indexer=true&lang=${lang}&min_seeds=${minSeeds}${filterSuffix}`, {
          method: "GET"
        });
        return res;
      })(), (async () => {
        const res = await this.backendRequest(`/api/torrents/list?category=series&sort=popular&limit=${popularLimit}&page=1&skip_indexer=true&lang=${lang}&min_seeds=${minSeeds}${filterSuffix}`, {
          method: "GET"
        });
        return res;
      })(), (async () => {
        const res = await this.backendRequest(`/api/torrents/list?category=films&sort=recent&limit=${recentLimit}&page=1&skip_indexer=true&lang=${lang}&min_seeds=${minSeeds}${filterSuffix}`, {
          method: "GET"
        });
        return res;
      })(), (async () => {
        const res = await this.backendRequest(`/api/torrents/list?category=series&sort=recent&limit=${recentLimit}&page=1&skip_indexer=true&lang=${lang}&min_seeds=${minSeeds}${filterSuffix}`, {
          method: "GET"
        });
        return res;
      })(), (async () => {
        const res = await this.backendRequest(`/api/torrents/fast?limit=20&min_seeds=50&lang=${lang}`, {
          method: "GET"
        });
        return res;
      })()]);
      if (!moviesRes.success && !seriesRes.success && !recentMoviesRes.success && !recentSeriesRes.success) {
        return {
          success: false,
          error: moviesRes.error || seriesRes.error || recentMoviesRes.error || recentSeriesRes.error || "BackendError",
          message: moviesRes.message || seriesRes.message || recentMoviesRes.message || recentSeriesRes.message || "Erreur lors du chargement du dashboard"
        };
      }
      const movies = Array.isArray(moviesRes.data) ? moviesRes.data.map(toContentItem).filter((i) => i.id) : [];
      const series = Array.isArray(seriesRes.data) ? seriesRes.data.map(toContentItem).filter((i) => i.id) : [];
      const recentMovies = Array.isArray(recentMoviesRes.data) ? recentMoviesRes.data.map(toContentItem).filter((i) => i.id) : [];
      const recentSeries = Array.isArray(recentSeriesRes.data) ? recentSeriesRes.data.map(toContentItem).filter((i) => i.id) : [];
      const fastTorrents = Array.isArray(fastTorrentsRes.data) ? fastTorrentsRes.data.map(toContentItem).filter((i) => i.id) : [];
      const popularMovieIds = new Set(movies.map((m) => m.id));
      const popularSeriesIds = new Set(series.map((s) => s.id));
      const recentMoviesFiltered = recentMovies.filter((m) => !popularMovieIds.has(m.id)).slice(0, 25);
      const recentSeriesFiltered = recentSeries.filter((s) => !popularSeriesIds.has(s.id)).slice(0, 25);
      const heroCandidate = [...movies, ...series].find((i) => i.backdrop || i.poster) || movies[0] || series[0];
      const dashboard2 = {
        hero: heroCandidate ? {
          id: heroCandidate.id,
          title: heroCandidate.title,
          overview: heroCandidate.overview,
          poster: heroCandidate.poster,
          backdrop: heroCandidate.backdrop,
          type: heroCandidate.type,
          releaseDate: heroCandidate.releaseDate,
          rating: heroCandidate.rating
        } : void 0,
        continueWatching: [],
        popularMovies: movies.slice(0, 50),
        popularSeries: series.slice(0, 50),
        recentAdditions: [...recentMoviesFiltered, ...recentSeriesFiltered],
        fastTorrents: fastTorrents.slice(0, 40)
      };
      return {
        success: true,
        data: dashboard2
      };
    } catch (e) {
      return {
        success: false,
        error: "DashboardError",
        message: e instanceof Error ? e.message : "Erreur lors du chargement du dashboard"
      };
    }
  },
  /**
   * Récupère les films
   * @param language - Code de langue optionnel (ex: 'fr', 'en', 'fr-FR', 'en-US')
   */
  async getFilmsData(language) {
    const lang = toTmdbLanguage(language);
    const res = await this.backendRequest(`/api/torrents/list?category=films&sort=popular&limit=30&page=1&skip_indexer=true&lang=${lang}`, {
      method: "GET"
    });
    if (!res.success) {
      console.warn("[DASHBOARD] Erreur lors de la récupération des films:", res.message || res.error);
      return res;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    console.log(`[DASHBOARD] ${rows.length} torrent(s) FILM reçu(s) du backend`);
    if (rows.length > 0) {
      const firstRow = rows[0];
      console.log("[DASHBOARD] Structure du premier torrent FILM:", {
        keys: Object.keys(firstRow),
        imageFields: {
          imageUrl: firstRow == null ? void 0 : firstRow.imageUrl,
          image_url: firstRow == null ? void 0 : firstRow.image_url,
          poster_url: firstRow == null ? void 0 : firstRow.poster_url,
          poster: firstRow == null ? void 0 : firstRow.poster,
          heroImageUrl: firstRow == null ? void 0 : firstRow.heroImageUrl,
          hero_image_url: firstRow == null ? void 0 : firstRow.hero_image_url,
          backdrop: firstRow == null ? void 0 : firstRow.backdrop
        }
      });
    }
    const films = rows.map((raw, index) => {
      const rawId = raw == null ? void 0 : raw.id;
      const idAsString = rawId !== void 0 && rawId !== null ? String(rawId) : "";
      const id = (raw == null ? void 0 : raw.slug) || idAsString || (raw == null ? void 0 : raw.infoHash) || (raw == null ? void 0 : raw.info_hash) || (raw == null ? void 0 : raw.info_hash_hex) || "";
      if (!id) {
        console.warn(`[DASHBOARD] Torrent FILM ${index} sans ID valide:`, {
          slug: raw == null ? void 0 : raw.slug,
          id: raw == null ? void 0 : raw.id,
          idAsString,
          infoHash: raw == null ? void 0 : raw.infoHash,
          info_hash: raw == null ? void 0 : raw.info_hash,
          info_hash_hex: raw == null ? void 0 : raw.info_hash_hex,
          name: raw == null ? void 0 : raw.name,
          cleanTitle: raw == null ? void 0 : raw.cleanTitle,
          raw: JSON.stringify(raw).substring(0, 200)
          // Aperçu des données brutes
        });
        return null;
      }
      return {
        id,
        title: (raw == null ? void 0 : raw.cleanTitle) || (raw == null ? void 0 : raw.clean_title) || (raw == null ? void 0 : raw.name) || (raw == null ? void 0 : raw.title) || "Sans titre",
        type: "movie",
        poster: (raw == null ? void 0 : raw.imageUrl) || (raw == null ? void 0 : raw.image_url) || (raw == null ? void 0 : raw.poster_url) || (raw == null ? void 0 : raw.poster) || void 0,
        backdrop: (raw == null ? void 0 : raw.heroImageUrl) || (raw == null ? void 0 : raw.hero_image_url) || (raw == null ? void 0 : raw.backdrop) || void 0,
        logo: (raw == null ? void 0 : raw.logoUrl) || (raw == null ? void 0 : raw.logo_url) || void 0,
        overview: (raw == null ? void 0 : raw.synopsis) || (raw == null ? void 0 : raw.overview) || void 0,
        rating: typeof (raw == null ? void 0 : raw.voteAverage) === "number" ? raw.voteAverage : raw == null ? void 0 : raw.vote_average,
        releaseDate: (raw == null ? void 0 : raw.releaseDate) || (raw == null ? void 0 : raw.release_date) || void 0,
        genres: Array.isArray(raw == null ? void 0 : raw.genres) ? raw.genres : void 0,
        tmdbId: typeof (raw == null ? void 0 : raw.tmdbId) === "number" ? raw.tmdbId : typeof (raw == null ? void 0 : raw.tmdb_id) === "number" ? raw.tmdb_id : null,
        seeds: typeof (raw == null ? void 0 : raw.seedCount) === "number" ? raw.seedCount : raw == null ? void 0 : raw.seed_count,
        peers: typeof (raw == null ? void 0 : raw.leechCount) === "number" ? raw.leechCount : raw == null ? void 0 : raw.leech_count,
        fileSize: typeof (raw == null ? void 0 : raw.fileSize) === "number" ? raw.fileSize : raw == null ? void 0 : raw.file_size
      };
    }).filter(Boolean);
    console.log(`[DASHBOARD] ${films.length} film(s) valide(s) après filtrage`);
    return {
      success: true,
      data: films
    };
  },
  /**
   * Récupère les séries
   * @param language - Code de langue optionnel (ex: 'fr', 'en', 'fr-FR', 'en-US')
   */
  async getSeriesData(language) {
    const lang = toTmdbLanguage(language);
    const res = await this.backendRequest(`/api/torrents/list?category=series&sort=popular&limit=30&page=1&skip_indexer=true&lang=${lang}`, {
      method: "GET"
    });
    if (!res.success) {
      console.warn("[DASHBOARD] Erreur lors de la récupération des séries:", res.message || res.error);
      return res;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    console.log(`[DASHBOARD] ${rows.length} torrent(s) SERIES reçu(s) du backend`);
    if (rows.length > 0) {
      const firstRow = rows[0];
      console.log("[DASHBOARD] Structure du premier torrent SERIES:", {
        keys: Object.keys(firstRow),
        imageFields: {
          imageUrl: firstRow == null ? void 0 : firstRow.imageUrl,
          image_url: firstRow == null ? void 0 : firstRow.image_url,
          poster_url: firstRow == null ? void 0 : firstRow.poster_url,
          poster: firstRow == null ? void 0 : firstRow.poster,
          heroImageUrl: firstRow == null ? void 0 : firstRow.heroImageUrl,
          hero_image_url: firstRow == null ? void 0 : firstRow.hero_image_url,
          backdrop: firstRow == null ? void 0 : firstRow.backdrop
        }
      });
    }
    const series = rows.map((raw, index) => {
      const rawId = raw == null ? void 0 : raw.id;
      const idAsString = rawId !== void 0 && rawId !== null ? String(rawId) : "";
      const id = (raw == null ? void 0 : raw.slug) || idAsString || (raw == null ? void 0 : raw.infoHash) || (raw == null ? void 0 : raw.info_hash) || (raw == null ? void 0 : raw.info_hash_hex) || "";
      if (!id) {
        console.warn(`[DASHBOARD] Torrent SERIES ${index} sans ID valide:`, {
          slug: raw == null ? void 0 : raw.slug,
          id: raw == null ? void 0 : raw.id,
          idAsString,
          infoHash: raw == null ? void 0 : raw.infoHash,
          info_hash: raw == null ? void 0 : raw.info_hash,
          info_hash_hex: raw == null ? void 0 : raw.info_hash_hex,
          name: raw == null ? void 0 : raw.name,
          cleanTitle: raw == null ? void 0 : raw.cleanTitle,
          raw: JSON.stringify(raw).substring(0, 200)
          // Aperçu des données brutes
        });
        return null;
      }
      return {
        id,
        title: (raw == null ? void 0 : raw.cleanTitle) || (raw == null ? void 0 : raw.clean_title) || (raw == null ? void 0 : raw.name) || (raw == null ? void 0 : raw.title) || "Sans titre",
        type: "tv",
        poster: (raw == null ? void 0 : raw.imageUrl) || (raw == null ? void 0 : raw.image_url) || (raw == null ? void 0 : raw.poster_url) || (raw == null ? void 0 : raw.poster) || void 0,
        backdrop: (raw == null ? void 0 : raw.heroImageUrl) || (raw == null ? void 0 : raw.hero_image_url) || (raw == null ? void 0 : raw.backdrop) || void 0,
        logo: (raw == null ? void 0 : raw.logoUrl) || (raw == null ? void 0 : raw.logo_url) || void 0,
        overview: (raw == null ? void 0 : raw.synopsis) || (raw == null ? void 0 : raw.overview) || void 0,
        rating: typeof (raw == null ? void 0 : raw.voteAverage) === "number" ? raw.voteAverage : raw == null ? void 0 : raw.vote_average,
        firstAirDate: (raw == null ? void 0 : raw.releaseDate) || (raw == null ? void 0 : raw.release_date) || void 0,
        genres: Array.isArray(raw == null ? void 0 : raw.genres) ? raw.genres : void 0,
        tmdbId: typeof (raw == null ? void 0 : raw.tmdbId) === "number" ? raw.tmdbId : typeof (raw == null ? void 0 : raw.tmdb_id) === "number" ? raw.tmdb_id : null,
        seeds: typeof (raw == null ? void 0 : raw.seedCount) === "number" ? raw.seedCount : raw == null ? void 0 : raw.seed_count,
        peers: typeof (raw == null ? void 0 : raw.leechCount) === "number" ? raw.leechCount : raw == null ? void 0 : raw.leech_count,
        fileSize: typeof (raw == null ? void 0 : raw.fileSize) === "number" ? raw.fileSize : raw == null ? void 0 : raw.file_size
      };
    }).filter(Boolean);
    console.log(`[DASHBOARD] ${series.length} série(s) valide(s) après filtrage`);
    return {
      success: true,
      data: series
    };
  },
  /**
   * Récupère les films avec pagination
   * @param minSeeds - 0 = tout afficher, 1+ = filtre
   * @param mediaLanguages - langues acceptées (ex: ["FRENCH","MULTI"]). Vide = toutes
   * @param minQuality - qualité minimale ("480p"|"720p"|"1080p"|"2160p"|"4K"). Vide = toutes
   */
  async getFilmsDataPaginated(page2 = 1, limit = 30, language, sort = "release_date", minSeeds = 0, mediaLanguages = [], minQuality = "") {
    const lang = toTmdbLanguage(language);
    const langParam = mediaLanguages.length > 0 ? `&media_languages=${encodeURIComponent(mediaLanguages.join(","))}` : "";
    const qualParam = minQuality ? `&min_quality=${encodeURIComponent(minQuality)}` : "";
    const res = await this.backendRequest(`/api/torrents/list?category=films&sort=${sort}&limit=${limit}&page=${page2}&skip_indexer=true&lang=${lang}&min_seeds=${minSeeds}${langParam}${qualParam}`, {
      method: "GET"
    });
    if (!res.success) {
      return res;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    const films = rows.map((raw) => {
      const rawId = raw == null ? void 0 : raw.id;
      const idAsString = rawId !== void 0 && rawId !== null ? String(rawId) : "";
      const id = (raw == null ? void 0 : raw.slug) || idAsString || (raw == null ? void 0 : raw.infoHash) || (raw == null ? void 0 : raw.info_hash) || (raw == null ? void 0 : raw.info_hash_hex) || "";
      if (!id) return null;
      return {
        id,
        title: (raw == null ? void 0 : raw.cleanTitle) || (raw == null ? void 0 : raw.clean_title) || (raw == null ? void 0 : raw.name) || (raw == null ? void 0 : raw.title) || "Sans titre",
        type: "movie",
        poster: (raw == null ? void 0 : raw.imageUrl) || (raw == null ? void 0 : raw.image_url) || (raw == null ? void 0 : raw.poster_url) || (raw == null ? void 0 : raw.poster) || void 0,
        backdrop: (raw == null ? void 0 : raw.heroImageUrl) || (raw == null ? void 0 : raw.hero_image_url) || (raw == null ? void 0 : raw.backdrop) || void 0,
        logo: (raw == null ? void 0 : raw.logoUrl) || (raw == null ? void 0 : raw.logo_url) || void 0,
        overview: (raw == null ? void 0 : raw.synopsis) || (raw == null ? void 0 : raw.overview) || void 0,
        rating: typeof (raw == null ? void 0 : raw.voteAverage) === "number" ? raw.voteAverage : raw == null ? void 0 : raw.vote_average,
        releaseDate: (raw == null ? void 0 : raw.releaseDate) || (raw == null ? void 0 : raw.release_date) || void 0,
        genres: Array.isArray(raw == null ? void 0 : raw.genres) ? raw.genres : void 0,
        tmdbId: typeof (raw == null ? void 0 : raw.tmdbId) === "number" ? raw.tmdbId : typeof (raw == null ? void 0 : raw.tmdb_id) === "number" ? raw.tmdb_id : null,
        seeds: typeof (raw == null ? void 0 : raw.seedCount) === "number" ? raw.seedCount : raw == null ? void 0 : raw.seed_count,
        peers: typeof (raw == null ? void 0 : raw.leechCount) === "number" ? raw.leechCount : raw == null ? void 0 : raw.leech_count,
        fileSize: typeof (raw == null ? void 0 : raw.fileSize) === "number" ? raw.fileSize : raw == null ? void 0 : raw.file_size
      };
    }).filter(Boolean);
    return {
      success: true,
      data: films
    };
  },
  /**
   * Récupère les séries avec pagination
   * @param mediaLanguages - langues acceptées. Vide = toutes
   * @param minQuality - qualité minimale. Vide = toutes
   */
  async getSeriesDataPaginated(page2 = 1, limit = 30, language, sort = "popular", minSeeds = 0, mediaLanguages = [], minQuality = "") {
    const lang = toTmdbLanguage(language);
    const langParam = mediaLanguages.length > 0 ? `&media_languages=${encodeURIComponent(mediaLanguages.join(","))}` : "";
    const qualParam = minQuality ? `&min_quality=${encodeURIComponent(minQuality)}` : "";
    const res = await this.backendRequest(`/api/torrents/list?category=series&sort=${sort}&limit=${limit}&page=${page2}&skip_indexer=true&lang=${lang}&min_seeds=${minSeeds}${langParam}${qualParam}`, {
      method: "GET"
    });
    if (!res.success) {
      return res;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    if (rows.length > 0) {
      const firstRow = rows[0];
      console.log("[DASHBOARD] Structure du premier torrent SERIES (paginated):");
      console.log("  - imageUrl:", firstRow == null ? void 0 : firstRow.imageUrl);
      console.log("  - image_url:", firstRow == null ? void 0 : firstRow.image_url);
      console.log("  - poster_url:", firstRow == null ? void 0 : firstRow.poster_url);
      console.log("  - poster:", firstRow == null ? void 0 : firstRow.poster);
      console.log("  - heroImageUrl:", firstRow == null ? void 0 : firstRow.heroImageUrl);
      console.log("  - hero_image_url:", firstRow == null ? void 0 : firstRow.hero_image_url);
      console.log("  - backdrop:", firstRow == null ? void 0 : firstRow.backdrop);
      console.log("  - tmdbId:", firstRow == null ? void 0 : firstRow.tmdbId);
      console.log("  - tmdb_id:", firstRow == null ? void 0 : firstRow.tmdb_id);
      console.log("  - Tous les clés:", Object.keys(firstRow));
      console.log("  - Données complètes (premiers 1000 caractères):", JSON.stringify(firstRow, null, 2).substring(0, 1e3));
    }
    const series = rows.map((raw) => {
      const rawId = raw == null ? void 0 : raw.id;
      const idAsString = rawId !== void 0 && rawId !== null ? String(rawId) : "";
      const id = (raw == null ? void 0 : raw.slug) || idAsString || (raw == null ? void 0 : raw.infoHash) || (raw == null ? void 0 : raw.info_hash) || (raw == null ? void 0 : raw.info_hash_hex) || "";
      if (!id) return null;
      return {
        id,
        title: (raw == null ? void 0 : raw.cleanTitle) || (raw == null ? void 0 : raw.clean_title) || (raw == null ? void 0 : raw.name) || (raw == null ? void 0 : raw.title) || "Sans titre",
        type: "tv",
        poster: (raw == null ? void 0 : raw.imageUrl) || (raw == null ? void 0 : raw.image_url) || (raw == null ? void 0 : raw.poster_url) || (raw == null ? void 0 : raw.poster) || void 0,
        backdrop: (raw == null ? void 0 : raw.heroImageUrl) || (raw == null ? void 0 : raw.hero_image_url) || (raw == null ? void 0 : raw.backdrop) || void 0,
        logo: (raw == null ? void 0 : raw.logoUrl) || (raw == null ? void 0 : raw.logo_url) || void 0,
        overview: (raw == null ? void 0 : raw.synopsis) || (raw == null ? void 0 : raw.overview) || void 0,
        rating: typeof (raw == null ? void 0 : raw.voteAverage) === "number" ? raw.voteAverage : raw == null ? void 0 : raw.vote_average,
        firstAirDate: (raw == null ? void 0 : raw.releaseDate) || (raw == null ? void 0 : raw.release_date) || void 0,
        genres: Array.isArray(raw == null ? void 0 : raw.genres) ? raw.genres : void 0,
        tmdbId: typeof (raw == null ? void 0 : raw.tmdbId) === "number" ? raw.tmdbId : typeof (raw == null ? void 0 : raw.tmdb_id) === "number" ? raw.tmdb_id : null,
        seeds: typeof (raw == null ? void 0 : raw.seedCount) === "number" ? raw.seedCount : raw == null ? void 0 : raw.seed_count,
        peers: typeof (raw == null ? void 0 : raw.leechCount) === "number" ? raw.leechCount : raw == null ? void 0 : raw.leech_count,
        fileSize: typeof (raw == null ? void 0 : raw.fileSize) === "number" ? raw.fileSize : raw == null ? void 0 : raw.file_size
      };
    }).filter(Boolean);
    return {
      success: true,
      data: series
    };
  }
};
async function requestPopcornWeb$1(endpoint, options = {}) {
  var _a2, _b;
  const apiUrl = getPopcornWebApiUrl();
  const fullUrl = `${apiUrl}${endpoint}`;
  const cloudToken = TokenManager.getCloudAccessToken();
  const headers = __spreadValues({
    "Content-Type": "application/json"
  }, options.headers);
  if (cloudToken) {
    headers["Authorization"] = `Bearer ${cloudToken}`;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1e4);
    let response;
    try {
      response = await fetch(fullUrl, __spreadProps(__spreadValues({}, options), {
        headers,
        signal: controller.signal
      }));
    } catch (error) {
      clearTimeout(timeoutId);
      if (isTauri() && (error instanceof TypeError || error instanceof Error && error.message.includes("Failed to fetch"))) {
        try {
          const {
            invoke
          } = await import("@tauri-apps/api/core");
          const method = options.method || "GET";
          const headerPairs = [];
          const headersObj = new Headers(headers);
          headersObj.forEach((value, key) => headerPairs.push([key, value]));
          const body = typeof options.body === "string" ? options.body : void 0;
          try {
            const nativeRes = await invoke("native-fetch", {
              url: fullUrl,
              method,
              headers: headerPairs,
              body,
              timeoutMs: 1e4
            });
            const response2 = new Response((_a2 = nativeRes == null ? void 0 : nativeRes.body) != null ? _a2 : "", {
              status: (_b = nativeRes == null ? void 0 : nativeRes.status) != null ? _b : 0,
              headers: (() => {
                const h2 = new Headers();
                for (const [k, v] of (nativeRes == null ? void 0 : nativeRes.headers) || []) {
                  if (k) h2.set(k, v);
                }
                return h2;
              })()
            });
            const rawText2 = await response2.text().catch(() => "");
            const data2 = rawText2 ? JSON.parse(rawText2) : {};
            if (response2.ok) {
              return {
                success: true,
                data: data2.data || data2
              };
            }
            return {
              success: false,
              error: data2.error || "UnknownError",
              message: data2.message || `Erreur ${response2.status}`
            };
          } catch (invokeError) {
            const errorMsg = invokeError instanceof Error ? invokeError.message : String(invokeError);
            if (errorMsg.includes("not found") || errorMsg.includes("Command native-fetch")) {
              const {
                fetch: httpFetch
              } = await import("@tauri-apps/plugin-http");
              const httpResponse = await httpFetch(fullUrl, {
                method,
                headers: Object.fromEntries(headerPairs),
                body
              });
              const responseBody = await httpResponse.text();
              const data2 = responseBody ? JSON.parse(responseBody) : {};
              if (httpResponse.ok) {
                return {
                  success: true,
                  data: data2.data || data2
                };
              }
              return {
                success: false,
                error: data2.error || "UnknownError",
                message: data2.message || `Erreur ${httpResponse.status}`
              };
            }
            throw invokeError;
          }
        } catch (tauriError) {
          return {
            success: false,
            error: "NetworkError",
            message: tauriError instanceof Error ? tauriError.message : "Erreur réseau"
          };
        }
      }
      throw error;
    }
    clearTimeout(timeoutId);
    const rawText = await response.text().catch(() => "");
    const data = rawText ? JSON.parse(rawText) : {};
    if (response.ok) {
      return {
        success: true,
        data: data.data || data
      };
    }
    return {
      success: false,
      error: data.error || "UnknownError",
      message: data.message || `Erreur ${response.status}`
    };
  } catch (error) {
    return {
      success: false,
      error: "NetworkError",
      message: error instanceof Error ? error.message : "Erreur réseau"
    };
  }
}
const twoFactorMethods = {
  /**
   * Récupère l'état de la 2FA pour l'utilisateur connecté
   */
  async getTwoFactorStatus() {
    return requestPopcornWeb$1("/auth/two-factor/status", {
      method: "GET"
    });
  },
  /**
   * Active l'authentification à deux facteurs
   */
  async enableTwoFactor() {
    return requestPopcornWeb$1("/auth/two-factor/enable", {
      method: "POST"
    });
  },
  /**
   * Désactive l'authentification à deux facteurs
   */
  async disableTwoFactor() {
    return requestPopcornWeb$1("/auth/two-factor/disable", {
      method: "POST"
    });
  },
  /**
   * Envoie un code de vérification 2FA par email
   */
  async sendTwoFactorCode() {
    return requestPopcornWeb$1("/auth/two-factor/send-code", {
      method: "POST"
    });
  },
  /**
   * Vérifie un code 2FA et génère les tokens complets
   * @param tempToken Token temporaire reçu lors du login avec 2FA
   * @param code Code à 6 chiffres reçu par email
   */
  async verifyTwoFactorCode(tempToken, code) {
    const result = await requestPopcornWeb$1("/auth/two-factor/verify", {
      method: "POST",
      body: JSON.stringify({
        tempToken,
        code
      })
    });
    if (result.success && result.data) {
      TokenManager.setCloudTokens(result.data.accessToken, result.data.refreshToken);
      if (result.data.jwtSecret) {
        TokenManager.setJWTSecret(result.data.jwtSecret);
      }
      this.saveTokens(result.data.accessToken, result.data.refreshToken);
      this.saveUser(result.data.user);
    }
    return result;
  }
};
async function requestPopcornWeb(endpoint, options = {}) {
  var _a2;
  const apiUrl = getPopcornWebApiUrl();
  const fullUrl = `${apiUrl}${endpoint}`;
  const cloudToken = TokenManager.getCloudAccessToken();
  const headers = __spreadValues({
    "Content-Type": "application/json"
  }, options.headers);
  if (cloudToken) {
    headers["Authorization"] = `Bearer ${cloudToken}`;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1e4);
    const response = await fetch(fullUrl, __spreadProps(__spreadValues({}, options), {
      headers,
      signal: controller.signal
    }));
    clearTimeout(timeoutId);
    const rawText = await response.text().catch(() => "");
    const data = rawText ? JSON.parse(rawText) : {};
    if (response.ok) {
      return {
        success: true,
        data: (_a2 = data.data) != null ? _a2 : data
      };
    }
    return {
      success: false,
      error: data.error || "UnknownError",
      message: data.message || `Erreur ${response.status}`
    };
  } catch (error) {
    return {
      success: false,
      error: "NetworkError",
      message: error instanceof Error ? error.message : "Erreur réseau"
    };
  }
}
const quickConnectMethods = {
  /**
   * Initialise une requête de connexion rapide
   * Retourne un code à 6 caractères et un secret unique
   */
  async initQuickConnect() {
    return requestPopcornWeb("/auth/quick-connect/init", {
      method: "POST"
    });
  },
  /**
   * Autorise une requête de connexion rapide (depuis un device déjà connecté)
   * @param code Code à 6 caractères à autoriser
   */
  async authorizeQuickConnect(code) {
    return requestPopcornWeb("/auth/quick-connect/authorize", {
      method: "POST",
      body: JSON.stringify({
        code
      })
    });
  },
  /**
   * Récupère l'état d'une requête de connexion rapide
   * @param secret Secret de la requête
   */
  async getQuickConnectStatus(secret) {
    return requestPopcornWeb("/auth/quick-connect/status", {
      method: "POST",
      body: JSON.stringify({
        secret
      })
    });
  },
  /**
   * Connecte un device en utilisant une requête de connexion rapide autorisée
   * @param secret Secret de la requête
   */
  async connectQuickConnect(secret) {
    const result = await requestPopcornWeb("/auth/quick-connect/connect", {
      method: "POST",
      body: JSON.stringify({
        secret
      })
    });
    if (result.success && result.data) {
      TokenManager.setCloudTokens(result.data.accessToken, result.data.refreshToken);
      if (result.data.jwtSecret) {
        TokenManager.setJWTSecret(result.data.jwtSecret);
      }
      this.saveTokens(result.data.accessToken, result.data.refreshToken);
      this.saveUser(result.data.user);
      if (result.data.clientUrl && typeof localStorage !== "undefined") {
        try {
          localStorage.setItem("webos_local_client_url", result.data.clientUrl.trim().replace(/\/$/, ""));
        } catch (e) {
        }
      }
    }
    return result;
  }
};
const localUsersMethods = {
  /**
   * Crée un utilisateur local dans le backend Rust
   * Appelé depuis popcorn-web lors de la synchronisation
   */
  async createLocalUser(request) {
    return this.backendRequest("/api/client/admin/local-users", {
      method: "POST",
      body: JSON.stringify(request)
    });
  },
  /**
   * Liste tous les utilisateurs locaux pour un compte cloud
   */
  async listLocalUsers(cloudAccountId) {
    return this.backendRequest(`/api/client/admin/local-users/list`, {
      method: "POST",
      body: JSON.stringify({
        cloud_account_id: cloudAccountId
      })
    });
  },
  /**
   * Récupère un utilisateur local par son ID
   */
  async getLocalUser(userId) {
    return this.backendRequest(`/api/client/admin/local-users/${userId}`, {
      method: "GET"
    });
  },
  /**
   * Met à jour un utilisateur local
   */
  async updateLocalUser(userId, displayName) {
    return this.backendRequest(`/api/client/admin/local-users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({
        display_name: displayName
      })
    });
  },
  /**
   * Supprime un utilisateur local
   */
  async deleteLocalUser(userId) {
    return this.backendRequest(`/api/client/admin/local-users/${userId}`, {
      method: "DELETE"
    });
  }
};
const friendsMethods = {
  async syncFriendShares(payload) {
    return this.backendRequest("/api/friends/sync", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
};
const requestsMethods = {
  // Favoris (à regarder plus tard) — header X-User-ID
  async listMediaFavorites(params) {
    var _a2, _b;
    const userId = (_b = (_a2 = this.getCurrentUserId) == null ? void 0 : _a2.call(this)) != null ? _b : null;
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    const q = new URLSearchParams();
    if ((params == null ? void 0 : params.limit) != null) q.set("limit", String(params.limit));
    if ((params == null ? void 0 : params.offset) != null) q.set("offset", String(params.offset));
    const query = q.toString();
    return this.backendRequest(`/api/favorites${query ? "?" + query : ""}`, {
      method: "GET",
      headers
    });
  },
  async addMediaFavorite(data) {
    var _a2, _b;
    const userId = (_b = (_a2 = this.getCurrentUserId) == null ? void 0 : _a2.call(this)) != null ? _b : null;
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    return this.backendRequest("/api/favorites", {
      method: "POST",
      headers: __spreadValues({
        "Content-Type": "application/json"
      }, headers),
      body: JSON.stringify(data)
    });
  },
  async removeMediaFavorite(tmdbId, tmdbType) {
    var _a2, _b;
    const userId = (_b = (_a2 = this.getCurrentUserId) == null ? void 0 : _a2.call(this)) != null ? _b : null;
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    return this.backendRequest(`/api/favorites/${tmdbId}/${encodeURIComponent(tmdbType)}`, {
      method: "DELETE",
      headers
    });
  },
  async checkMediaFavorite(tmdbId, tmdbType) {
    var _a2, _b;
    const userId = (_b = (_a2 = this.getCurrentUserId) == null ? void 0 : _a2.call(this)) != null ? _b : null;
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    return this.backendRequest(`/api/favorites/check/${tmdbId}/${encodeURIComponent(tmdbType)}`, {
      method: "GET",
      headers
    });
  },
  async listMediaRequests(params) {
    const q = new URLSearchParams();
    if (params == null ? void 0 : params.user_id) q.set("user_id", params.user_id);
    if (params == null ? void 0 : params.status) q.set("status", params.status);
    if (params == null ? void 0 : params.limit) q.set("limit", String(params.limit));
    if (params == null ? void 0 : params.offset) q.set("offset", String(params.offset));
    const query = q.toString();
    return this.backendRequest(`/api/requests${query ? "?" + query : ""}`, {
      method: "GET"
    });
  },
  async createMediaRequest(data) {
    return this.backendRequest("/api/requests", {
      method: "POST",
      body: JSON.stringify(data)
    });
  },
  async getMediaRequest(id) {
    return this.backendRequest(`/api/requests/${id}`, {
      method: "GET"
    });
  },
  async updateRequestStatus(id, data) {
    return this.backendRequest(`/api/requests/${id}/status`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },
  async deleteMediaRequest(id) {
    return this.backendRequest(`/api/requests/${id}`, {
      method: "DELETE"
    });
  },
  async getQuotaStats(userId) {
    return this.backendRequest(`/api/users/${encodeURIComponent(userId)}/quota`, {
      method: "GET"
    });
  },
  // Blacklist
  async listBlacklist(params) {
    const q = new URLSearchParams();
    if (params == null ? void 0 : params.user_id) q.set("user_id", params.user_id);
    if (params == null ? void 0 : params.limit) q.set("limit", String(params.limit));
    if (params == null ? void 0 : params.offset) q.set("offset", String(params.offset));
    const query = q.toString();
    return this.backendRequest(`/api/blacklist${query ? "?" + query : ""}`, {
      method: "GET"
    });
  },
  async addToBlacklist(data) {
    return this.backendRequest("/api/blacklist", {
      method: "POST",
      body: JSON.stringify(data)
    });
  },
  async removeFromBlacklist(tmdbId, mediaType) {
    return this.backendRequest(`/api/blacklist/${tmdbId}/${mediaType}`, {
      method: "DELETE"
    });
  },
  async checkBlacklisted(tmdbId, mediaType) {
    return this.backendRequest(`/api/blacklist/${tmdbId}/${encodeURIComponent(mediaType)}`, {
      method: "GET"
    });
  },
  // Discover
  async listDiscoverSliders() {
    return this.backendRequest("/api/discover/sliders", {
      method: "GET"
    });
  },
  async listEnabledDiscoverSliders() {
    return this.backendRequest("/api/discover/sliders/enabled", {
      method: "GET"
    });
  },
  async initializeDiscoverSliders() {
    return this.backendRequest("/api/discover/sliders/initialize", {
      method: "POST"
    });
  },
  async discoverMovies(params) {
    var _a2, _b;
    const q = new URLSearchParams();
    if (params == null ? void 0 : params.page) q.set("page", String(params.page));
    if (params == null ? void 0 : params.language) q.set("language", params.language);
    if (params == null ? void 0 : params.sort_by) q.set("sort_by", params.sort_by);
    if (params == null ? void 0 : params.genre) q.set("genre", params.genre);
    if (params == null ? void 0 : params.primary_release_date_gte) q.set("primary_release_date_gte", params.primary_release_date_gte);
    if (params == null ? void 0 : params.primary_release_date_lte) q.set("primary_release_date_lte", params.primary_release_date_lte);
    if ((params == null ? void 0 : params.vote_average_gte) != null) q.set("vote_average_gte", String(params.vote_average_gte));
    if ((params == null ? void 0 : params.vote_count_gte) != null) q.set("vote_count_gte", String(params.vote_count_gte));
    const query = q.toString();
    const userId = (_b = (_a2 = this.getCurrentUserId) == null ? void 0 : _a2.call(this)) != null ? _b : null;
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    return this.backendRequest(`/api/discover/movies${query ? "?" + query : ""}`, {
      method: "GET",
      headers
    });
  },
  async getTmdbMovieDetail(tmdbId, language) {
    var _a2, _b;
    const q = language ? `?language=${encodeURIComponent(language)}` : "";
    const userId = (_b = (_a2 = this.getCurrentUserId) == null ? void 0 : _a2.call(this)) != null ? _b : null;
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    return this.backendRequest(`/api/discover/movie/${tmdbId}${q}`, {
      method: "GET",
      headers
    });
  },
  async getTmdbTvDetail(tmdbId, language) {
    var _a2, _b;
    const q = language ? `?language=${encodeURIComponent(language)}` : "";
    const userId = (_b = (_a2 = this.getCurrentUserId) == null ? void 0 : _a2.call(this)) != null ? _b : null;
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    return this.backendRequest(`/api/discover/tv/${tmdbId}${q}`, {
      method: "GET",
      headers
    });
  },
  async discoverTv(params) {
    var _a2, _b;
    const q = new URLSearchParams();
    if (params == null ? void 0 : params.page) q.set("page", String(params.page));
    if (params == null ? void 0 : params.language) q.set("language", params.language);
    if (params == null ? void 0 : params.sort_by) q.set("sort_by", params.sort_by);
    if (params == null ? void 0 : params.genre) q.set("genre", params.genre);
    if (params == null ? void 0 : params.first_air_date_gte) q.set("first_air_date_gte", params.first_air_date_gte);
    if (params == null ? void 0 : params.first_air_date_lte) q.set("first_air_date_lte", params.first_air_date_lte);
    if ((params == null ? void 0 : params.vote_average_gte) != null) q.set("vote_average_gte", String(params.vote_average_gte));
    if ((params == null ? void 0 : params.vote_count_gte) != null) q.set("vote_count_gte", String(params.vote_count_gte));
    const query = q.toString();
    const userId = (_b = (_a2 = this.getCurrentUserId) == null ? void 0 : _a2.call(this)) != null ? _b : null;
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    return this.backendRequest(`/api/discover/tv${query ? "?" + query : ""}`, {
      method: "GET",
      headers
    });
  },
  /** Recherche TMDB par texte (quand aucun torrent trouvé). Résultats exploitables pour "Demander". */
  async searchTmdb(params) {
    var _a2, _b;
    const q = new URLSearchParams();
    q.set("q", params.q);
    if (params.type) q.set("type", params.type);
    if (params.language) q.set("language", params.language);
    if (params.page) q.set("page", String(params.page));
    const userId = (_b = (_a2 = this.getCurrentUserId) == null ? void 0 : _a2.call(this)) != null ? _b : null;
    const headers = userId ? {
      "X-User-ID": userId
    } : {};
    return this.backendRequest(`/api/discover/search?${q.toString()}`, {
      method: "GET",
      headers
    });
  }
};
const systemMethods = {
  async resetBackendDatabase() {
    return this.backendRequest("/api/admin/database/reset", {
      method: "POST"
    });
  },
  async forceCacheCleanup() {
    return this.backendRequest("/api/media/cache/cleanup", {
      method: "POST"
    });
  },
  async getTranscodingConfig() {
    return this.backendRequest("/api/media/config/transcoding", {
      method: "GET"
    });
  },
  async updateTranscodingConfig(body) {
    return this.backendRequest("/api/media/config/transcoding", {
      method: "PUT",
      body: JSON.stringify(body)
    });
  },
  async getSystemResources() {
    return this.backendRequest("/api/media/resources", {
      method: "GET"
    });
  }
};
const _ServerApiClient = class _ServerApiClient {
  constructor(baseUrl) {
    __publicField(this, "baseUrl");
    __publicField(this, "accessToken", null);
    __publicField(this, "refreshToken", null);
    this.baseUrl = "";
    if (baseUrl && baseUrl.trim() && baseUrl !== "undefined") {
      this.baseUrl = baseUrl.trim();
    }
    this.loadTokens();
  }
  getBackendBaseUrl() {
    const raw = getBackendUrl();
    return (raw || "http://127.0.0.1:3000").trim().replace(/\/$/, "");
  }
  async nativeFetch(url, init, timeoutMs) {
    var _a2, _b;
    let fetchStandardError = null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, __spreadProps(__spreadValues({}, init), {
        signal: controller.signal
      }));
      return response;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      fetchStandardError = fetchError;
      if (!isTauri()) {
        throw fetchError;
      }
      const isAbortError = fetchError instanceof Error && fetchError.name === "AbortError";
      if (isAbortError) {
        throw fetchError;
      }
    }
    if (isTauri() && fetchStandardError) {
      const logNative = async (message) => {
        try {
          const {
            invoke
          } = await import("@tauri-apps/api/core");
          await invoke("log-message", {
            message
          });
        } catch (e) {
        }
      };
      await logNative(`[popcorn-debug] fetch standard failed, trying Tauri methods as fallback for ${url}`);
      console.warn("[popcorn-debug] fetch standard failed, falling back to Tauri methods:", {
        url
      });
      const method = (init == null ? void 0 : init.method) && typeof init.method === "string" ? init.method : "GET";
      const headerPairs = [];
      try {
        const h2 = init == null ? void 0 : init.headers;
        if (h2) {
          const headersObj = new Headers(h2);
          headersObj.forEach((value, key) => headerPairs.push([key, value]));
        }
      } catch (e) {
      }
      const body = typeof (init == null ? void 0 : init.body) === "string" || (init == null ? void 0 : init.body) instanceof String ? String(init.body) : void 0;
      const usePluginHttpFallback = async () => {
        await logNative(`[popcorn-debug] Using plugin-http fallback for ${url}`);
        try {
          const {
            fetch: httpFetch
          } = await import("@tauri-apps/plugin-http");
          await logNative(`[popcorn-debug] plugin-http imported successfully`);
          const httpResponse = await httpFetch(url, {
            method,
            headers: Object.fromEntries(headerPairs),
            body
          });
          await logNative(`[popcorn-debug] plugin-http response: status=${httpResponse.status}`);
          const responseBody = await httpResponse.text();
          const responseHeaders = new Headers();
          httpResponse.headers.forEach((value, key) => {
            responseHeaders.set(key, value);
          });
          return new Response(responseBody, {
            status: httpResponse.status,
            headers: responseHeaders
          });
        } catch (httpError) {
          httpError instanceof Error ? httpError.message : String(httpError);
          const httpErrDetails = httpError instanceof Error ? {
            name: httpError.name,
            message: httpError.message,
            stack: httpError.stack
          } : {
            value: httpError,
            type: typeof httpError
          };
          await logNative(`[popcorn-debug] plugin-http fallback failed: ${JSON.stringify(httpErrDetails)}`);
          return null;
        }
      };
      try {
        const {
          invoke
        } = await import("@tauri-apps/api/core");
        const res = await invoke("native-fetch", {
          url,
          method,
          headers: headerPairs,
          body,
          timeoutMs
        });
        const outHeaders = new Headers();
        try {
          for (const [k, v] of (res == null ? void 0 : res.headers) || []) {
            if (k) outHeaders.set(k, v);
          }
        } catch (e) {
        }
        return new Response((_a2 = res == null ? void 0 : res.body) != null ? _a2 : "", {
          status: (_b = res == null ? void 0 : res.status) != null ? _b : 0,
          headers: outHeaders
        });
      } catch (e) {
        e instanceof Error ? {
          name: e.name,
          message: e.message,
          stack: e.stack
        } : {};
        const errorMsg = e instanceof Error ? e.message : String(e);
        const errorStr = errorMsg.toLowerCase();
        const errorName = e instanceof Error ? e.name : "";
        const isCommandNotFound = errorStr.includes("not found") || errorStr.includes("command") && (errorStr.includes("native-fetch") || errorStr.includes("not found")) || errorStr.includes("unknown command") || errorStr.includes("command not found") || errorName === "CommandNotFound" || errorName === "TauriError" && errorStr.includes("not found");
        let pluginHttpResult = null;
        if (isCommandNotFound) {
          await logNative(`[popcorn-debug] Command not found detected, using plugin-http fallback`);
          pluginHttpResult = await usePluginHttpFallback();
        } else {
          try {
            const {
              invoke: invokeCheck
            } = await import("@tauri-apps/api/core");
            const platform = await invokeCheck("get-platform").catch(() => "unknown");
            if (platform === "android") {
              await logNative(`[popcorn-debug] Android detected, trying plugin-http as last resort`);
              pluginHttpResult = await usePluginHttpFallback();
            }
          } catch (e2) {
          }
        }
        if (pluginHttpResult !== null) {
          return pluginHttpResult;
        }
        await logNative(`[popcorn-debug] native-fetch and plugin-http both failed for ${url}`);
        console.error("[popcorn-debug] All fetch methods failed:", {
          url,
          method
        });
        throw fetchStandardError;
      }
    }
    throw new Error("Unreachable code in nativeFetch");
  }
  saveUser(user) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(_ServerApiClient.STORAGE_USER_KEY, JSON.stringify(user || null));
    } catch (e) {
    }
  }
  getUser() {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(_ServerApiClient.STORAGE_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  getCurrentUserId() {
    var _a2;
    const u = this.getUser();
    const id = (u == null ? void 0 : u.id) || ((_a2 = u == null ? void 0 : u.user) == null ? void 0 : _a2.id);
    return typeof id === "string" && id.trim() ? id : null;
  }
  /**
   * Détecte si une erreur est récupérable (peut être retentée).
   * Connexion refusée / Failed to fetch : pas de retry (backend injoignable, évite le spam de requêtes et de logs).
   */
  isRetryableError(error, response) {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("connection refused") || msg.includes("err_connection_refused")) {
        return false;
      }
      if (error.name === "AbortError" || msg.includes("timeout")) {
        return true;
      }
    }
    if (response && response.status >= 500 && response.status < 600) {
      return true;
    }
    return false;
  }
  /**
   * Empêche les requêtes HTTP depuis une page HTTPS (Mixed Content).
   */
  getMixedContentError(url) {
    if (typeof window === "undefined") return null;
    if (window.location.protocol !== "https:") return null;
    try {
      const urlObj = new URL(url, window.location.origin);
      if (urlObj.protocol !== "http:") return null;
      const host = urlObj.hostname.toLowerCase();
      const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
      if (isLocalhost) return null;
      return "Le site est en HTTPS et le backend est en HTTP. Le navigateur bloque cette requête (Mixed Content). Configure un backend HTTPS (reverse proxy) ou utilise une URL backend HTTPS.";
    } catch (e) {
      return null;
    }
  }
  /**
   * Retourne un message d'erreur clair pour l'utilisateur
   */
  getErrorMessage(error, response, endpoint, url) {
    if (error instanceof Error && error.name === "AbortError") {
      const urlInfo = url ? `

URL utilisée: ${url}` : "";
      return {
        code: "Timeout",
        message: `Le backend ne répond pas. Vérifiez que le serveur est démarré et accessible.${urlInfo}`
      };
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("connection")) {
        const urlInfo = url ? `

URL utilisée: ${url}` : "";
        const isAndroid = typeof window !== "undefined" && /Android/i.test(navigator.userAgent || "");
        let message = `Impossible de se connecter au backend.${urlInfo}`;
        if (isAndroid) {
          message += `

Sur Android:
• Vérifiez que l'IP est correcte (pas 10.0.2.2 sur appareil physique)
• Utilisez l'IP locale de votre machine (ex: http://192.168.1.100:3000)
• Assurez-vous que votre mobile et votre PC sont sur le même réseau Wi-Fi
• Vérifiez que le backend Rust est démarré
• Testez depuis le navigateur mobile: ${url || "http://VOTRE_IP:3000"}/api/client/health`;
        } else {
          message += `

Vérifiez votre connexion réseau et que le serveur est démarré.`;
        }
        return {
          code: "ConnectionError",
          message
        };
      }
    }
    if (response) {
      if (response.status === 401) {
        return {
          code: "Unauthorized",
          message: "Authentification requise. Veuillez vous connecter."
        };
      }
      if (response.status === 403) {
        return {
          code: "Forbidden",
          message: "Accès refusé. Vous n'avez pas les permissions nécessaires."
        };
      }
      if (response.status === 404) {
        return {
          code: "NotFound",
          message: "Ressource non trouvée sur le serveur."
        };
      }
      if (response.status >= 500) {
        return {
          code: "ServerError",
          message: "Erreur serveur. Veuillez réessayer dans quelques instants."
        };
      }
    }
    return {
      code: "NetworkError",
      message: error instanceof Error ? error.message : "Erreur réseau inconnue."
    };
  }
  async backendRequest(endpoint, options = {}, retryCount = 0, baseUrlOverride) {
    var _a2;
    const base = baseUrlOverride != null ? baseUrlOverride : this.getBackendBaseUrl();
    const url = `${base}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const maxRetries = 2;
    const mixedContentError = this.getMixedContentError(url);
    if (mixedContentError) {
      return {
        success: false,
        error: "MixedContent",
        message: mixedContentError
      };
    }
    const headers = __spreadValues({
      "Content-Type": "application/json"
    }, options.headers || {});
    if (typeof window !== "undefined" && ((_a2 = window.location) == null ? void 0 : _a2.origin)) {
      try {
        const requestOrigin = new URL(url).origin;
        if (requestOrigin === window.location.origin) {
          const h2 = (window.location.hostname || "").toLowerCase();
          const isCloud = h2 === "client.popcornn.app" || h2.endsWith(".client.popcornn.app");
          headers["X-Popcorn-Client-Origin"] = isCloud ? "cloud" : "local";
        }
      } catch (e) {
      }
    }
    const noCache = (options.method === "GET" || !options.method) && (endpoint.includes("/api/torrents/list") || endpoint.includes("/api/sync/status"));
    const fetchOptions = noCache ? __spreadProps(__spreadValues({}, options), {
      headers,
      cache: "no-store"
    }) : __spreadProps(__spreadValues({}, options), {
      headers
    });
    try {
      const timeoutMs = this.getTimeoutMs(endpoint);
      const response = await this.nativeFetch(url, fetchOptions, timeoutMs);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (typeof window !== "undefined" && (endpoint.includes("/auth/login") || endpoint.includes("/sync/start"))) {
          const dataStr = JSON.stringify(data, null, 2);
          console.error(`[server-api] Erreur backend (${endpoint}):`, {
            status: response.status,
            statusText: response.statusText,
            url
          });
          console.error("[server-api] Données complètes du backend:", dataStr);
          console.error("[server-api] Structure data:", data && typeof data === "object" ? Object.keys(data) : []);
        }
        if (retryCount < maxRetries && this.isRetryableError(null, response)) {
          const delay = Math.min(1e3 * Math.pow(2, retryCount), 3e3);
          console.warn(`[server-api] Erreur récupérable ${response.status}, retry dans ${delay}ms (tentative ${retryCount + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.backendRequest(endpoint, options, retryCount + 1, baseUrlOverride);
        }
        let errorMessage = `Erreur ${response.status}`;
        let errorCode = "BackendError";
        if (data && typeof data === "object") {
          if (data.error && typeof data.error === "string") {
            errorMessage = data.error;
            errorCode = data.error.includes("mot de passe") ? "InvalidCredentials" : "BackendError";
          } else if (data.message && typeof data.message === "string") {
            errorMessage = data.message;
          } else if (data.detail && typeof data.detail === "string") {
            errorMessage = data.detail;
          }
        }
        return {
          success: false,
          error: errorCode,
          message: errorMessage
        };
      }
      return {
        success: true,
        data: data && typeof data === "object" && "data" in data ? data.data : data
      };
    } catch (error) {
      error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : {};
      if (retryCount < maxRetries && this.isRetryableError(error)) {
        const delay = Math.min(1e3 * Math.pow(2, retryCount), 3e3);
        console.warn(`[server-api] Erreur réseau récupérable, retry dans ${delay}ms (tentative ${retryCount + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.backendRequest(endpoint, options, retryCount + 1, baseUrlOverride);
      }
      const errorInfo = this.getErrorMessage(error, void 0, endpoint, url);
      console.error("[server-api] Erreur de connexion:", {
        url,
        endpoint,
        error: error instanceof Error ? error.message : String(error),
        errorCode: errorInfo.code
      });
      return {
        success: false,
        error: errorInfo.code,
        message: errorInfo.message
      };
    }
  }
  getTimeoutMs(endpoint) {
    if (endpoint.includes("/torrents/magnet")) return 6e4;
    if (endpoint.includes("/api/torrents/list")) return 6e4;
    if (endpoint.includes("/api/media/") || endpoint.includes("/api/torrents/")) return 3e4;
    if (endpoint.startsWith("/api/v1/setup/")) return 6e4;
    if (endpoint.startsWith("/api/v1/sync/")) return 6e4;
    if (endpoint.includes("/api/indexers/test")) return 6e4;
    if (endpoint.includes("/health") || endpoint.includes("/api/client/health")) {
      const isAndroid = typeof window !== "undefined" && /Android/i.test(navigator.userAgent || "");
      return isAndroid ? 1e4 : 5e3;
    }
    return 15e3;
  }
  /**
   * Télécharge le journal de la synchronisation (en cours ou dernière exécution) en fichier .txt.
   */
  async downloadSyncLog() {
    if (typeof window === "undefined") {
      return {
        success: false,
        error: "Unavailable",
        message: "Disponible uniquement côté client."
      };
    }
    const base = this.getBackendBaseUrl();
    const url = `${base}/api/sync/log`;
    this.loadTokens();
    const headers = {};
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    try {
      const response = await this.nativeFetch(url, {
        method: "GET",
        headers
      }, 3e4);
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return {
          success: false,
          error: "BackendError",
          message: text || `Erreur ${response.status}`
        };
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      let filename = "sync-log.txt";
      if (disposition) {
        const match = /filename="?([^";\n]+)"?/.exec(disposition);
        if (match) filename = match[1].trim();
      }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
      return {
        success: true,
        data: void 0
      };
    } catch (error) {
      return {
        success: false,
        error: "NetworkError",
        message: error instanceof Error ? error.message : "Erreur lors du téléchargement du journal."
      };
    }
  }
  /**
   * Génère des tokens JWT côté client (comme en Tauri)
   * Utilisé pour unifier la logique entre web et Android
   * Utilise Web Crypto API pour compatibilité navigateur
   * 
   * ⚠️ Cette méthode ne doit être appelée que côté client (navigateur/Tauri)
   * Ne pas appeler en SSR (Server-Side Rendering)
   */
  async generateClientTokens(userId, username) {
    if (typeof window === "undefined") {
      throw new Error("generateClientTokens can only be called in a client context (browser or Tauri). It cannot be called during SSR. Make sure this code is only executed in client-side components or use client:only directive in Astro.");
    }
    try {
      const accessToken = await generateAccessToken({
        userId,
        username
      });
      const refreshToken = await generateRefreshToken({
        userId,
        username
      });
      return {
        accessToken,
        refreshToken
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("Web Crypto API")) {
        throw new Error(`Erreur de génération de tokens JWT: ${error.message}`);
      }
      throw error;
    }
  }
  /**
   * Récupère l'URL du backend Rust
   * Unifié pour web et Android : on utilise toujours l'URL du backend directement
   */
  getServerUrl() {
    const backend2 = this.getBackendBaseUrl();
    if (backend2 && backend2 !== "undefined" && backend2.trim()) {
      return backend2;
    }
    if (typeof window !== "undefined") {
      console.warn("[server-api] Backend URL non configuré, utilisation de localhost:3000 par défaut");
    }
    return "http://127.0.0.1:3000";
  }
  /**
   * Charge les tokens depuis le stockage local
   */
  loadTokens() {
    if (typeof window === "undefined") return;
    this.accessToken = localStorage.getItem("access_token");
    this.refreshToken = localStorage.getItem("refresh_token");
  }
  /**
   * Sauvegarde les tokens dans le stockage local
   */
  saveTokens(accessToken, refreshToken) {
    if (typeof window === "undefined") return;
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }
  /**
   * Supprime les tokens du stockage local
   */
  clearTokens() {
    if (typeof window === "undefined") return;
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    this.accessToken = null;
    this.refreshToken = null;
  }
  /**
   * Effectue une requête HTTP avec gestion automatique de l'authentification
   */
  async request(endpoint, options = {}) {
    const baseUrl = this.getServerUrl();
    if (!baseUrl || baseUrl === "undefined" || baseUrl.trim() === "") {
      return this.backendRequest(endpoint, options);
    }
    const url = `${baseUrl}${endpoint}`;
    const mixedContentError = this.getMixedContentError(url);
    if (mixedContentError) {
      return {
        success: false,
        error: "MixedContent",
        message: mixedContentError
      };
    }
    if (typeof window !== "undefined") {
      this.loadTokens();
    }
    const headers = __spreadValues({
      "Content-Type": "application/json"
    }, options.headers);
    try {
      if (typeof window !== "undefined") {
        const backendUrl = getBackendUrl();
        if (backendUrl && backendUrl !== "undefined" && backendUrl.trim()) {
          headers["X-Popcorn-Backend-Url"] = backendUrl.trim();
        }
      }
    } catch (e) {
    }
    const isAuthBootstrapEndpoint = endpoint === "/api/v1/auth/login" || endpoint === "/api/v1/auth/register" || endpoint === "/api/v1/auth/login-cloud" || endpoint === "/api/v1/auth/register-cloud";
    if (this.accessToken && !isAuthBootstrapEndpoint) headers.Authorization = `Bearer ${this.accessToken}`;
    try {
      const timeoutMs = this.getTimeoutMs(endpoint);
      const response = await this.nativeFetch(url, __spreadProps(__spreadValues({}, options), {
        headers
      }), timeoutMs);
      if (!isAuthBootstrapEndpoint && response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          headers.Authorization = `Bearer ${this.accessToken}`;
          const retryResponse = await this.nativeFetch(url, __spreadProps(__spreadValues({}, options), {
            headers
          }), timeoutMs);
          return await this.handleResponse(retryResponse);
        }
      }
      return await this.handleResponse(response);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          error: "Timeout",
          message: "Timeout: le serveur ne répond pas (backend probablement non accessible)."
        };
      }
      if (error instanceof Error && !error.message.includes("401")) {
        console.error("Erreur API:", error);
      }
      return {
        success: false,
        error: "NetworkError",
        message: error instanceof Error ? error.message : "Erreur réseau"
      };
    }
  }
  /**
   * Gère la réponse HTTP
   */
  async handleResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        const err = data && typeof data === "object" ? data.error : void 0;
        const msg = data && typeof data === "object" ? data.message : void 0;
        return {
          success: false,
          error: err || "Unauthorized",
          message: msg || err || "Non authentifié"
        };
      }
      return {
        success: false,
        error: data.error || "UnknownError",
        message: data.message || `Erreur ${response.status}`
      };
    }
    let responseData = data.data || data;
    if (responseData && typeof responseData === "object" && "success" in responseData && "data" in responseData) {
      responseData = responseData.data || responseData;
    }
    return {
      success: true,
      data: responseData
    };
  }
  /**
   * Rafraîchit le token d'accès
   * Désactivé : les tokens sont générés côté client, pas besoin de refresh via API
   */
  async refreshAccessToken() {
    return false;
  }
  // Les méthodes publiques sont ajoutées via Object.assign à la fin du fichier depuis les modules
  /**
   * Définit l'URL du serveur (client Astro)
   * Note: Dans le navigateur, cette méthode est ignorée car le client doit toujours se connecter à lui-même
   * via window.location.origin. Cette méthode est utile uniquement en SSR ou pour les tests.
   * L'URL du backend Rust est stockée dans localStorage (côté client) via backend-config.ts
   */
  setServerUrl(url) {
    if (typeof window !== "undefined") {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[server-api] setServerUrl() appelé dans le navigateur - l'URL backend est gérée par getBackendBaseUrl() via localStorage");
      }
      return;
    }
    let normalizedUrl = url.trim();
    try {
      const urlObj = new URL(normalizedUrl);
      if (urlObj.protocol === "https:" && urlObj.port === "443") {
        urlObj.port = "";
        normalizedUrl = urlObj.toString();
      }
      if (urlObj.protocol === "http:" && urlObj.port === "80") {
        urlObj.port = "";
        normalizedUrl = urlObj.toString();
      }
      normalizedUrl = normalizedUrl.replace(/\/$/, "");
    } catch (e) {
    }
    this.baseUrl = normalizedUrl;
  }
  /**
   * Vérifie si l'utilisateur est authentifié
   */
  isAuthenticated() {
    if (typeof window !== "undefined") {
      this.loadTokens();
    }
    return !!this.accessToken;
  }
  /**
   * Récupère le token d'accès (pour usage interne dans les endpoints API)
   * Recharge les tokens depuis localStorage si nécessaire
   */
  getAccessToken() {
    if (typeof window !== "undefined") {
      this.loadTokens();
    }
    return this.accessToken;
  }
};
__publicField(_ServerApiClient, "STORAGE_USER_KEY", "popcorn_user");
let ServerApiClient = _ServerApiClient;
Object.assign(ServerApiClient.prototype, authMethods, mediaMethods, libraryMethods, healthMethods, indexersMethods, settingsMethods, syncMethods, dashboardMethods, twoFactorMethods, quickConnectMethods, localUsersMethods, friendsMethods, requestsMethods, systemMethods);
const realServerApi = new ServerApiClient();
const serverApi = new Proxy(realServerApi, {
  get(target, prop, receiver) {
    if (typeof window !== "undefined" && isDemoMode()) {
      const demo2 = getDemoServerApi();
      const val = demo2[prop];
      if (val !== void 0) {
        if (typeof val === "function") {
          return val.bind(demo2);
        }
        return val;
      }
    }
    return Reflect.get(target, prop, receiver);
  }
});
let lastRedirect = null;
const REDIRECT_COOLDOWN = 500;
function normalizePath(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return p.replace(/\/$/, "") || "/";
}
function redirectTo(path) {
  if (typeof window === "undefined") {
    return;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  let currentPath = window.location.pathname;
  if (window.location.protocol === "file:") {
    const match = currentPath.match(/\/([^/]+)\.html?$/);
    if (match) {
      const base = match[1].toLowerCase();
      currentPath = base === "index" ? "/" : "/" + base;
    }
  }
  if (normalizePath(currentPath) === normalizePath(normalizedPath)) {
    return;
  }
  const now = Date.now();
  if (lastRedirect && normalizePath(lastRedirect.path) === normalizePath(normalizedPath) && now - lastRedirect.timestamp < REDIRECT_COOLDOWN) {
    return;
  }
  lastRedirect = {
    path: normalizedPath,
    timestamp: now
  };
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    const file = normalizedPath === "/" ? "./index.html" : `./${normalizedPath.slice(1)}.html`;
    const doReplace = () => window.location.replace(file);
    if (document.readyState !== "complete") {
      window.addEventListener("load", () => setTimeout(doReplace, 100), {
        once: true
      });
    } else {
      setTimeout(doReplace, 100);
    }
    return;
  }
  window.location.href = `${window.location.origin}${normalizedPath}`;
}
function getPathHref(path) {
  if (typeof window === "undefined") return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (window.location.protocol === "file:") {
    return normalizedPath === "/" ? "./index.html" : `./${normalizedPath.slice(1)}.html`;
  }
  return `${window.location.origin}${normalizedPath}`;
}
async function generateQRCode(data) {
  const content = typeof data === "string" ? data : JSON.stringify(data);
  try {
    const dataUrl = await QRCode.toDataURL(content, {
      errorCorrectionLevel: "M",
      type: "image/png",
      quality: 0.92,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#FFFFFF"
      },
      width: 300
    });
    return dataUrl;
  } catch (error) {
    console.error("[QRCODE] Erreur lors de la génération du QR code:", error);
    throw new Error("Impossible de générer le QR code");
  }
}
function QuickConnectDisplay({
  onConnected,
  onError,
  qrSize = 256,
  showTitle = true,
  title,
  description,
  className = "",
  compact = false
}) {
  const {
    t
  } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [code, setCode] = useState(null);
  const [secret, setSecret] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState(null);
  const [status, setStatus] = useState("pending");
  const [expiresAt, setExpiresAt] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const pollingIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);
  useEffect(() => {
    initQuickConnect();
    return () => {
      if (pollingIntervalRef.current !== null) {
        clearInterval(pollingIntervalRef.current);
      }
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (expiresAt) {
      setTimeRemaining(Math.max(0, Math.floor((expiresAt - Date.now()) / 1e3)));
      timerIntervalRef.current = window.setInterval(() => {
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1e3));
        setTimeRemaining(remaining);
        if (remaining <= 0) {
          if (timerIntervalRef.current !== null) {
            clearInterval(timerIntervalRef.current);
          }
        }
      }, 1e3);
    }
    return () => {
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [expiresAt]);
  const initQuickConnect = async () => {
    setLoading(true);
    setError(null);
    setStatus("pending");
    try {
      const response = await serverApi.initQuickConnect();
      if (!response.success) {
        const errorMsg = response.message || t("settingsPages.quickConnect.initError");
        setError(errorMsg);
        onError == null ? void 0 : onError(errorMsg);
        setLoading(false);
        return;
      }
      if (response.data) {
        setCode(response.data.code);
        setSecret(response.data.secret);
        setExpiresAt(response.data.expiresAt);
        const baseUrl = getPopcornWebBaseUrl();
        const quickConnectPageUrl = `${baseUrl}/quick-connect?code=${encodeURIComponent(response.data.code)}`;
        try {
          const qrUrl = await generateQRCode(quickConnectPageUrl);
          setQrCodeUrl(qrUrl);
        } catch (qrError) {
          console.warn("[QuickConnectDisplay] Erreur lors de la génération du QR code:", qrError);
        }
        startPolling(response.data.secret);
      }
    } catch (err) {
      const errorMsg = "Erreur lors de l'initialisation";
      setError(errorMsg);
      onError == null ? void 0 : onError(errorMsg);
      console.error("[QuickConnectDisplay]", err);
    } finally {
      setLoading(false);
    }
  };
  const startPolling = (secretToPoll) => {
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
    }
    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const statusResponse = await serverApi.getQuickConnectStatus(secretToPoll);
        if (statusResponse.success && statusResponse.data) {
          const newStatus = statusResponse.data.status;
          setStatus(newStatus);
          if (newStatus === "authorized") {
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            await connectQuickConnect(secretToPoll);
          } else if (newStatus === "expired" || newStatus === "used") {
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            if (newStatus === "expired") {
              setError(t("settingsPages.quickConnect.codeExpired"));
            }
          }
        }
      } catch (err) {
        console.error("[QuickConnectDisplay] Erreur lors du polling:", err);
      }
    }, 2e3);
  };
  const connectQuickConnect = async (secretToConnect) => {
    setLoading(true);
    setError(null);
    try {
      const response = await serverApi.connectQuickConnect(secretToConnect);
      if (!response.success) {
        const errorMsg = response.message || t("settingsPages.quickConnect.connectError");
        setError(errorMsg);
        onError == null ? void 0 : onError(errorMsg);
        setLoading(false);
        return;
      }
      setStatus("used");
      if (onConnected) {
        await onConnected();
      }
    } catch (err) {
      const errorMsg = t("settingsPages.quickConnect.connectError");
      setError(errorMsg);
      onError == null ? void 0 : onError(errorMsg);
      console.error("[QuickConnectDisplay]", err);
      setLoading(false);
    }
  };
  const handleRegenerateCode = () => {
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setCode(null);
    setSecret(null);
    setQrCodeUrl(null);
    setStatus("pending");
    setError(null);
    initQuickConnect();
  };
  const containerClasses = compact ? `space-y-4 ${className}` : `space-y-6 ${className}`;
  return jsxs("div", {
    className: containerClasses,
    children: [showTitle && jsxs(Fragment$1, {
      children: [jsx("h3", {
        className: compact ? "text-xl font-bold text-white" : "text-2xl font-bold text-white",
        children: title != null ? title : t("settingsPages.quickConnect.title")
      }), jsx("p", {
        className: "text-gray-400 text-sm",
        children: description != null ? description : t("settingsPages.quickConnect.description")
      })]
    }), error && jsx("div", {
      className: "bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 cursor-pointer hover:bg-red-900/40 transition-colors",
      onClick: handleRegenerateCode,
      children: jsx("span", {
        children: error
      })
    }), loading && !code && jsx("div", {
      className: `flex justify-center items-center ${compact ? "min-h-[200px]" : "min-h-[300px]"}`,
      children: jsx("span", {
        className: "loading loading-spinner loading-lg text-primary-500"
      })
    }), code && jsxs("div", {
      className: compact ? "space-y-4" : "space-y-6",
      children: [qrCodeUrl && jsxs("div", {
        className: "flex flex-col items-center space-y-3",
        children: [jsx("div", {
          className: "bg-white p-3 rounded-lg shadow-lg",
          children: jsx("img", {
            src: qrCodeUrl,
            alt: t("settingsPages.quickConnect.qrAlt"),
            style: {
              width: qrSize,
              height: qrSize
            },
            className: "block"
          })
        }), jsx("p", {
          className: "text-gray-400 text-xs text-center",
          children: t("settingsPages.quickConnect.scanHint")
        })]
      }), jsx("div", {
        className: "bg-gray-900/50 border border-gray-700 rounded-lg p-4",
        children: jsxs("div", {
          className: "text-center space-y-3",
          children: [jsxs("div", {
            children: [jsx("label", {
              className: "block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide",
              children: t("settingsPages.quickConnect.codeLabel")
            }), jsx("div", {
              className: `font-mono font-bold text-white tracking-[0.3em] ${compact ? "text-3xl" : "text-4xl"}`,
              children: code
            })]
          }), timeRemaining > 0 && status === "pending" && jsxs("div", {
            className: "text-gray-500 text-xs",
            children: [t("settingsPages.quickConnect.expiresIn"), " ", Math.floor(timeRemaining / 60), ":", (timeRemaining % 60).toString().padStart(2, "0")]
          }), status === "pending" && jsxs("div", {
            className: "flex items-center justify-center gap-2 text-blue-400 text-sm",
            children: [jsx("span", {
              className: "loading loading-spinner loading-xs"
            }), jsx("span", {
              children: t("settingsPages.quickConnect.waitingAuth")
            })]
          }), status === "authorized" && jsxs("div", {
            className: "flex items-center justify-center gap-2 text-green-400 text-sm",
            children: [jsx("svg", {
              className: "w-4 h-4",
              fill: "currentColor",
              viewBox: "0 0 20 20",
              children: jsx("path", {
                fillRule: "evenodd",
                d: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z",
                clipRule: "evenodd"
              })
            }), jsx("span", {
              children: t("settingsPages.quickConnect.authorized")
            })]
          }), status === "used" && jsxs("div", {
            className: "flex items-center justify-center gap-2 text-green-400 text-sm",
            children: [jsx("svg", {
              className: "w-4 h-4",
              fill: "currentColor",
              viewBox: "0 0 20 20",
              children: jsx("path", {
                fillRule: "evenodd",
                d: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z",
                clipRule: "evenodd"
              })
            }), jsx("span", {
              children: t("settingsPages.quickConnect.connectedSuccess")
            })]
          })]
        })
      }), (status === "expired" || timeRemaining <= 0) && jsx("div", {
        className: "flex justify-center",
        children: jsx("button", {
          onClick: handleRegenerateCode,
          disabled: loading,
          className: "px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          children: "Générer un nouveau code"
        })
      }), status === "pending" && timeRemaining > 0 && jsx("div", {
        className: "flex justify-center",
        children: jsx("button", {
          onClick: handleRegenerateCode,
          disabled: loading,
          className: "px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded transition-colors disabled:opacity-50",
          children: t("settingsPages.quickConnect.regenerateCode")
        })
      })]
    })]
  });
}
function LoginForm() {
  const {
    t
  } = useI18n();
  const [activeTab, setActiveTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingUsers, setCheckingUsers] = useState(true);
  useEffect(() => {
    const t2 = setTimeout(() => window.dispatchEvent(new Event("popcorn-app-ready")), 100);
    return () => clearTimeout(t2);
  }, []);
  useEffect(() => {
    const checkUsers = async () => {
      try {
        const setupResponse = await serverApi.getSetupStatus();
        if (setupResponse.success && setupResponse.data) {
          if (setupResponse.data.backendReachable !== false && setupResponse.data.hasUsers === false) {
            redirectTo("/setup");
            return;
          }
        }
      } catch (error2) {
        console.error("[LoginForm] Erreur lors de la vérification des utilisateurs:", error2);
      } finally {
        setCheckingUsers(false);
      }
    };
    checkUsers();
  }, []);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const response = await serverApi.login(email, password);
      if (!response.success) {
        let errorMessage = response.message || response.error || t("errors.generic");
        if (response.error === "DatabaseError" || errorMessage.includes("Base de données non configurée")) {
          errorMessage = t("loginForm.errors.dbNotConfigured");
        } else if (response.error === "InvalidCredentials") {
          errorMessage = t("loginForm.errors.invalidCredentials");
        } else if (errorMessage.includes("500") || errorMessage.includes("Internal Server Error")) {
          errorMessage = t("loginForm.errors.serverError");
        }
        setError(errorMessage);
        setIsLoading(false);
        return;
      }
      redirectTo("/dashboard");
    } catch (err) {
      setError(t("loginForm.errors.networkError"));
      console.error("Erreur:", err);
    } finally {
      setIsLoading(false);
    }
  };
  if (checkingUsers) {
    return jsx("div", {
      className: "w-full max-w-md bg-black/80 backdrop-blur-sm border border-white/20 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl mx-3 sm:mx-4",
      children: jsxs("div", {
        className: "text-center",
        children: [jsx("span", {
          className: "loading loading-spinner loading-lg text-primary-500"
        }), jsx("p", {
          className: "mt-4 text-white",
          children: t("common.verification")
        })]
      })
    });
  }
  const handleQuickConnectSuccess = () => {
    redirectTo("/dashboard");
  };
  return jsxs("div", {
    className: "w-full max-w-md bg-black/80 backdrop-blur-sm border border-white/20 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl mx-3 sm:mx-4",
    children: [jsx("h2", {
      className: "text-2xl sm:text-3xl font-bold text-white text-center mb-4 sm:mb-6",
      children: t("loginForm.title")
    }), jsxs("div", {
      className: "flex border-b border-white/20 mb-4 sm:mb-6",
      children: [jsx("button", {
        type: "button",
        "data-focusable": true,
        className: `flex-1 py-2.5 sm:py-3 px-3 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors ${activeTab === "login" ? "text-primary-500 border-b-2 border-primary-500" : "text-gray-400 hover:text-white"}`,
        onClick: () => {
          setActiveTab("login");
          setError(null);
        },
        children: t("loginForm.emailPassword")
      }), jsx("button", {
        type: "button",
        "data-focusable": true,
        className: `flex-1 py-2.5 sm:py-3 px-3 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors ${activeTab === "quick-connect" ? "text-primary-500 border-b-2 border-primary-500" : "text-gray-400 hover:text-white"}`,
        onClick: () => {
          setActiveTab("quick-connect");
          setError(null);
        },
        children: t("loginForm.quickConnect")
      })]
    }), activeTab === "login" && jsxs("form", {
      onSubmit: handleSubmit,
      children: [error && jsx("div", {
        className: "bg-primary-900/20 border border-primary-600 text-primary-400 px-4 py-3 rounded mb-4",
        children: jsx("span", {
          children: error
        })
      }), jsxs("div", {
        className: "mb-3 sm:mb-4",
        children: [jsx("label", {
          className: "block text-white text-sm font-medium mb-1.5 sm:mb-2",
          children: t("loginForm.email")
        }), jsx("input", {
          type: "email",
          className: "form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors",
          value: email,
          onInput: (e) => setEmail(e.target.value),
          placeholder: t("loginForm.emailPlaceholder"),
          required: true,
          autoFocus: true,
          autocomplete: "email"
        })]
      }), jsxs("div", {
        className: "mb-4 sm:mb-6",
        children: [jsx("label", {
          className: "block text-white text-sm font-medium mb-1.5 sm:mb-2",
          children: t("loginForm.password")
        }), jsx("input", {
          type: "password",
          className: "form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors",
          value: password,
          onInput: (e) => setPassword(e.target.value),
          placeholder: t("loginForm.passwordPlaceholder"),
          required: true,
          autocomplete: "current-password"
        })]
      }), jsx("button", {
        type: "submit",
        className: `form-tv-button w-full bg-primary hover:bg-primary-700 text-white font-medium py-2.5 sm:py-3 rounded text-sm sm:text-base transition-colors shadow-primary ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`,
        disabled: isLoading,
        children: isLoading ? t("loginForm.submitting") : t("loginForm.submit")
      })]
    }), activeTab === "quick-connect" && jsx(QuickConnectDisplay, {
      onConnected: handleQuickConnectSuccess,
      onError: (err) => setError(err),
      qrSize: 200,
      showTitle: false,
      compact: true,
      className: "py-2"
    }), jsx("div", {
      className: "text-center mt-6",
      children: jsxs("p", {
        className: "text-gray-400 text-sm",
        children: [t("loginForm.noAccount"), " ", jsx("a", {
          href: getPathHref("/register"),
          className: "text-white hover:text-primary-400 transition-colors font-medium",
          children: t("loginForm.register")
        })]
      })
    })]
  });
}
const $$Login = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Connexion - Popcorn Vercel" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="flex flex-col justify-center items-center min-h-screen bg-black px-4 py-16"> <div class="mb-8 animate-fade-in"> <img src="/popcorn_logo.png" alt="Popcorn Vercel" class="w-20 h-20 sm:w-24 sm:h-24 object-contain mx-auto" loading="eager"> </div> ${renderComponent($$result2, "LoginForm", LoginForm, { "client:load": true, "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/LoginForm", "client:component-export": "default" })} <div class="mt-6 text-center"> <a href="/settings/server" class="text-gray-400 hover:text-white text-sm transition-colors underline">
Configurer l'URL du serveur
</a> </div> </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/login.astro", void 0);
const $$file$v = "D:/Github/popcorn-client/src/pages/login.astro";
const $$url$v = "/./login.html";
const _page$v = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Login,
  file: $$file$v,
  url: $$url$v
}, Symbol.toStringTag, { value: "Module" }));
const page$v = () => _page$v;
var __freeze$1 = Object.freeze;
var __defProp$1 = Object.defineProperty;
var __template$1 = (cooked, raw) => __freeze$1(__defProp$1(cooked, "raw", { value: __freeze$1(raw || cooked.slice()) }));
var _a$1;
const $$Player = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate(_a$1 || (_a$1 = __template$1(['<html lang="fr" data-theme="dark" class="overflow-x-hidden"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Redirection… - Popcornn</title>', `</head> <body class="min-h-screen bg-page text-white flex items-center justify-center"> <div class="text-center"> <p class="text-white/80">Redirection…</p> </div> <script>
      (function () {
        try {
          var params = new URLSearchParams(window.location.search);
          var id = params.get('contentId') || params.get('id') || params.get('slug');
          if (id) {
            window.location.replace('/torrents?slug=' + encodeURIComponent(id));
            return;
          }
          // fallback: /player/<id>
          var m = (window.location.pathname || '').match(/^\\/player\\/(.+)$/);
          if (m && m[1]) {
            window.location.replace('/torrents?slug=' + encodeURIComponent(m[1]));
            return;
          }
          window.location.replace('/dashboard');
        } catch (e) {
          window.location.replace('/dashboard');
        }
      })();
    <\/script> </body> </html>`], ['<html lang="fr" data-theme="dark" class="overflow-x-hidden"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Redirection… - Popcornn</title>', `</head> <body class="min-h-screen bg-page text-white flex items-center justify-center"> <div class="text-center"> <p class="text-white/80">Redirection…</p> </div> <script>
      (function () {
        try {
          var params = new URLSearchParams(window.location.search);
          var id = params.get('contentId') || params.get('id') || params.get('slug');
          if (id) {
            window.location.replace('/torrents?slug=' + encodeURIComponent(id));
            return;
          }
          // fallback: /player/<id>
          var m = (window.location.pathname || '').match(/^\\\\/player\\\\/(.+)$/);
          if (m && m[1]) {
            window.location.replace('/torrents?slug=' + encodeURIComponent(m[1]));
            return;
          }
          window.location.replace('/dashboard');
        } catch (e) {
          window.location.replace('/dashboard');
        }
      })();
    <\/script> </body> </html>`])), renderHead());
}, "D:/Github/popcorn-client/src/pages/player.astro", void 0);
const $$file$u = "D:/Github/popcorn-client/src/pages/player.astro";
const $$url$u = "/./player.html";
const _page$u = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Player,
  file: $$file$u,
  url: $$url$u
}, Symbol.toStringTag, { value: "Module" }));
const page$u = () => _page$u;
function RegisterForm() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    inviteCode: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success2, setSuccess] = useState(null);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (formData.password !== formData.confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    if (formData.password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    setIsLoading(true);
    try {
      const response = await serverApi.register(formData.email, formData.password, formData.inviteCode);
      if (!response.success) {
        let errorMessage = response.message || response.error || "Erreur lors de l'inscription";
        if (response.error === "DatabaseError" || errorMessage.includes("Base de données non configurée")) {
          errorMessage = "Le serveur n'a pas de base de données configurée. Veuillez contacter l'administrateur du serveur.";
        } else if (errorMessage.includes("500") || errorMessage.includes("Internal Server Error")) {
          errorMessage = "Erreur serveur. Le serveur n'est peut-être pas correctement configuré.";
        }
        setError(errorMessage);
        setIsLoading(false);
        return;
      }
      setSuccess("Inscription réussie ! Redirection...");
      setTimeout(() => {
        redirectTo("/login");
      }, 1500);
    } catch (err) {
      setError("Erreur de connexion. Vérifiez votre connexion réseau et l'URL du serveur dans les paramètres.");
      console.error("Erreur:", err);
    } finally {
      setIsLoading(false);
    }
  };
  const handleChange = (field) => (e) => {
    const target = e.target;
    setFormData((prev) => __spreadProps(__spreadValues({}, prev), {
      [field]: target.value
    }));
  };
  return jsxs("div", {
    className: "w-full max-w-md bg-black/80 backdrop-blur-sm border border-white/20 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl mx-3 sm:mx-4",
    children: [jsx("h2", {
      className: "text-2xl sm:text-3xl font-bold text-white text-center mb-4 sm:mb-6",
      children: "Inscription"
    }), jsxs("form", {
      onSubmit: handleSubmit,
      children: [error && jsx("div", {
        className: "bg-red-900/20 border border-red-600 text-red-400 px-4 py-3 rounded mb-4",
        children: jsx("span", {
          children: error
        })
      }), success2 && jsx("div", {
        className: "bg-green-900/20 border border-green-600 text-green-400 px-4 py-3 rounded mb-4",
        children: jsx("span", {
          children: success2
        })
      }), jsxs("div", {
        className: "mb-3 sm:mb-4",
        children: [jsx("label", {
          className: "block text-white text-sm font-medium mb-1.5 sm:mb-2",
          children: "Code de parrainage"
        }), jsx("input", {
          type: "text",
          className: "form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors",
          value: formData.inviteCode,
          onInput: (e) => handleChange("inviteCode")(e),
          placeholder: "Entrez votre code de parrainage",
          required: true,
          autoFocus: true
        })]
      }), jsxs("div", {
        className: "mb-3 sm:mb-4",
        children: [jsx("label", {
          className: "block text-white text-sm font-medium mb-1.5 sm:mb-2",
          children: "Email"
        }), jsx("input", {
          type: "email",
          className: "form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors",
          value: formData.email,
          onInput: (e) => handleChange("email")(e),
          placeholder: "votre@email.com",
          required: true,
          autocomplete: "email"
        })]
      }), jsxs("div", {
        className: "mb-3 sm:mb-4",
        children: [jsx("label", {
          className: "block text-white text-sm font-medium mb-1.5 sm:mb-2",
          children: "Mot de passe"
        }), jsx("input", {
          type: "password",
          className: "form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors",
          value: formData.password,
          onInput: (e) => handleChange("password")(e),
          placeholder: "Au moins 8 caractères",
          required: true,
          autocomplete: "new-password"
        })]
      }), jsxs("div", {
        className: "mb-4 sm:mb-6",
        children: [jsx("label", {
          className: "block text-white text-sm font-medium mb-1.5 sm:mb-2",
          children: "Confirmer le mot de passe"
        }), jsx("input", {
          type: "password",
          className: "form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors",
          value: formData.confirmPassword,
          onInput: (e) => handleChange("confirmPassword")(e),
          placeholder: "Confirmez votre mot de passe",
          required: true,
          autocomplete: "new-password"
        })]
      }), jsx("button", {
        type: "submit",
        className: `form-tv-button w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 sm:py-3 rounded text-sm sm:text-base transition-colors ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`,
        disabled: isLoading,
        children: isLoading ? "Inscription..." : "S'inscrire"
      })]
    }), jsx("div", {
      className: "text-center mt-6",
      children: jsxs("p", {
        className: "text-gray-400 text-sm",
        children: ["Déjà un compte ?", " ", jsx("a", {
          href: "/login",
          className: "text-white hover:text-red-600 transition-colors font-medium",
          children: "Se connecter"
        })]
      })
    })]
  });
}
const $$Register = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Inscription - Popcorn Vercel" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="flex flex-col justify-center items-center min-h-screen bg-black px-4 py-16"> <div class="mb-8 animate-fade-in"> <img src="/popcorn_logo.png" alt="Popcorn Vercel" class="w-20 h-20 sm:w-24 sm:h-24 object-contain mx-auto" loading="eager"> </div> ${renderComponent($$result2, "RegisterForm", RegisterForm, { "client:load": true, "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/RegisterForm", "client:component-export": "default" })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/register.astro", void 0);
const $$file$t = "D:/Github/popcorn-client/src/pages/register.astro";
const $$url$t = "/./register.html";
const _page$t = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Register,
  file: $$file$t,
  url: $$url$t
}, Symbol.toStringTag, { value: "Module" }));
const page$t = () => _page$t;
const $$Requests = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Mes demandes - Popcorn" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "MyRequests", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/requests/MyRequests", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/requests.astro", void 0);
const $$file$s = "D:/Github/popcorn-client/src/pages/requests.astro";
const $$url$s = "/./requests.html";
const _page$s = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Requests,
  file: $$file$s,
  url: $$url$s
}, Symbol.toStringTag, { value: "Module" }));
const page$s = () => _page$s;
const $$Search = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Recherche - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "SearchComponent", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/Search", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/search.astro", void 0);
const $$file$r = "D:/Github/popcorn-client/src/pages/search.astro";
const $$url$r = "/./search.html";
const _page$r = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Search,
  file: $$file$r,
  url: $$url$r
}, Symbol.toStringTag, { value: "Module" }));
const page$r = () => _page$r;
const $$Series = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Séries - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "SeriesDashboard", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/dashboard/SeriesDashboard", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/series.astro", void 0);
const $$file$q = "D:/Github/popcorn-client/src/pages/series.astro";
const $$url$q = "/./series.html";
const _page$q = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Series,
  file: $$file$q,
  url: $$url$q
}, Symbol.toStringTag, { value: "Module" }));
const page$q = () => _page$q;
function getUserType() {
  const user = TokenManager.getUser();
  if (!user) {
    return null;
  }
  if (TokenManager.getCloudAccessToken()) {
    return "cloud";
  }
  if (user.role === "local") {
    return "local";
  }
  return "cloud";
}
function canAccess(feature) {
  var _a2;
  const userType = getUserType();
  if (!userType) {
    return false;
  }
  if (userType === "cloud") {
    return true;
  }
  const localUserPermissions = {
    // Accès complet
    "library.view": true,
    "library.manage": true,
    "torrents.view": true,
    "torrents.download": true,
    "media.view": true,
    "media.stream": true,
    "downloads.view": true,
    // Paramètres limités
    "settings.language": true,
    "settings.ui_preferences": true,
    "settings.download_location": true,
    // Accès refusé
    "settings.indexers": false,
    "settings.tmdb": false,
    "settings.sync": false,
    "settings.server": false,
    "settings.friends": false,
    // Réservé au compte principal
    "settings.local_users": false,
    // Les utilisateurs locaux ne peuvent pas gérer d'autres utilisateurs locaux
    "settings.account": false
    // Les utilisateurs locaux ne peuvent pas modifier leur compte (géré par le compte principal)
  };
  return (_a2 = localUserPermissions[feature]) != null ? _a2 : false;
}
const NAV_ITEMS = [{
  id: "overview",
  labelKey: "settingsMenu.overview",
  href: "/settings",
  icon: LayoutDashboard
}, {
  id: "system",
  labelKey: "settingsMenu.category.system",
  href: "/settings/server",
  icon: Monitor,
  permission: "settings.server",
  pathPrefix: "/settings/server"
}, {
  id: "maintenance",
  labelKey: "settingsMenu.category.maintenance",
  href: "/settings?category=maintenance",
  icon: Wrench,
  permission: "settings.server",
  categoryParam: "maintenance"
}, {
  id: "interface",
  labelKey: "settingsMenu.category.interface",
  href: "/settings/ui-preferences",
  icon: Palette,
  permission: "settings.ui_preferences",
  pathPrefix: "/settings/ui-preferences"
}, {
  id: "playback",
  labelKey: "settingsMenu.category.playback",
  href: "/settings?category=playback",
  icon: Play,
  permission: "settings.ui_preferences",
  categoryParam: "playback"
}, {
  id: "content",
  labelKey: "settingsMenu.category.content",
  href: "/settings?category=content",
  icon: LayoutGrid,
  permissions: ["settings.indexers", "settings.sync", "settings.server"],
  categoryParam: "content"
}, {
  id: "library",
  labelKey: "settingsMenu.category.library",
  href: "/settings?category=library",
  icon: Library,
  categoryParam: "library"
}, {
  id: "discovery",
  labelKey: "settingsMenu.category.discovery",
  href: "/settings?category=discovery",
  icon: Globe,
  permission: "settings.server",
  categoryParam: "discovery"
}, {
  id: "account",
  labelKey: "settingsMenu.category.account",
  href: "/settings/account",
  icon: UserCircle,
  permission: "settings.account",
  pathPrefix: "/settings/account"
}];
function isItemVisible(item) {
  var _a2;
  if (item.permission) return canAccess(item.permission);
  if ((_a2 = item.permissions) == null ? void 0 : _a2.length) return item.permissions.some((p) => canAccess(p));
  return true;
}
function isItemActive(item, pathname, search2) {
  if (item.id === "overview") {
    return pathname === "/settings" && !new URLSearchParams(search2).get("category");
  }
  if (item.pathPrefix && pathname.startsWith(item.pathPrefix)) {
    if (item.pathPrefix === "/settings/server") return pathname === "/settings/server" || pathname.startsWith("/settings/server/");
    if (item.pathPrefix === "/settings/ui-preferences") return pathname === "/settings/ui-preferences" || pathname.startsWith("/settings/ui-preferences/");
    if (item.pathPrefix === "/settings/account") return pathname.startsWith("/settings/account");
    return true;
  }
  if (item.categoryParam) {
    return pathname === "/settings" && new URLSearchParams(search2).get("category") === item.categoryParam;
  }
  return false;
}
function SettingsSidebar() {
  const {
    t
  } = useI18n();
  const [pathname, setPathname] = useState(typeof window !== "undefined" ? window.location.pathname : "/settings");
  const [search2, setSearch] = useState(typeof window !== "undefined" ? window.location.search : "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const update = () => {
      setPathname(window.location.pathname);
      setSearch(window.location.search);
    };
    update();
    window.addEventListener("popstate", update);
    document.addEventListener("astro:page-load", update);
    return () => {
      window.removeEventListener("popstate", update);
      document.removeEventListener("astro:page-load", update);
    };
  }, []);
  useEffect(() => {
    const openDrawer = () => setSidebarOpen(true);
    document.addEventListener("open-settings-drawer", openDrawer);
    return () => document.removeEventListener("open-settings-drawer", openDrawer);
  }, []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const visibleItems = useMemo(() => mounted ? NAV_ITEMS.filter(isItemVisible) : NAV_ITEMS, [mounted]);
  return jsxs(Fragment$1, {
    children: [sidebarOpen && jsx("div", {
      className: "lg:hidden fixed inset-0 z-[25] bg-[var(--ds-surface-overlay)]",
      "aria-hidden": true,
      onClick: () => setSidebarOpen(false)
    }), jsxs("nav", {
      className: `
          settings-sidebar flex-shrink-0 w-[min(18rem,85vw)] sm:w-72 lg:w-72 xl:w-80 border-b lg:border-b-0 lg:border-r border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]
          fixed left-0 z-[30] top-[calc(3.75rem+var(--safe-area-inset-top,0px))] bottom-0
          lg:static lg:top-auto lg:bottom-auto lg:h-full
          transform transition-transform duration-200 ease-out
          pt-4 lg:pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]
          overflow-hidden flex flex-col
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `,
      "aria-label": t("settingsMenu.title"),
      "data-tv-settings-nav": true,
      children: [jsxs("div", {
        className: "px-3 sm:px-4 pt-2 pb-2 min-w-0 flex-shrink-0",
        children: [jsx("h2", {
          className: "ds-title-page truncate text-base sm:text-lg",
          children: t("settingsMenu.title")
        }), jsx("p", {
          className: "ds-text-secondary text-xs mt-1 hidden lg:block",
          children: t("settingsMenu.subtitle")
        })]
      }), jsx("ul", {
        className: "py-2 px-2 space-y-0.5 sm:space-y-1 scrollbar-hide overflow-y-auto overflow-x-hidden flex-1 min-h-0",
        role: "list",
        children: visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item, pathname, search2);
          return jsx("li", {
            children: jsxs("a", {
              href: item.href,
              "data-astro-prefetch": true,
              "data-settings-category": true,
              "data-focusable": true,
              onClick: () => setSidebarOpen(false),
              onFocus: (e) => {
                if (!isActive) {
                  e.currentTarget.click();
                }
              },
              className: `
                    settings-nav-item w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-left transition-all duration-200
                    focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)]
                    min-h-[44px] sm:min-h-[48px] tv:min-h-[56px] min-w-0 touch-manipulation
                    ${isActive ? "bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)]" : "text-[var(--ds-text-secondary)] hover:bg-white/10 hover:text-[var(--ds-text-primary)]"}
                  `,
              tabIndex: 0,
              "aria-current": isActive ? "page" : void 0,
              "aria-label": t(item.labelKey),
              children: [jsx(Icon, {
                className: `w-5 h-5 sm:w-6 sm:h-6 tv:w-7 tv:h-7 flex-shrink-0 ${isActive ? "opacity-100" : "opacity-80"}`,
                "aria-hidden": true
              }), jsx("span", {
                className: "font-semibold truncate min-w-0 text-sm sm:text-base",
                children: t(item.labelKey)
              })]
            })
          }, item.id);
        })
      })]
    })]
  });
}
function SettingsMobileMenuTrigger() {
  const {
    t
  } = useI18n();
  const handleClick = () => {
    document.dispatchEvent(new CustomEvent("open-settings-drawer"));
  };
  return jsxs(Fragment$1, {
    children: [jsx("div", {
      className: "lg:hidden fixed left-0 z-[28] top-[calc(3.75rem+var(--safe-area-inset-top,0px))] sm:top-[calc(5rem+var(--safe-area-inset-top,0px))] md:top-[calc(5.5rem+var(--safe-area-inset-top,0px))] pt-2 pl-[max(0.75rem,env(safe-area-inset-left,0px))]",
      "aria-hidden": true,
      children: jsxs("button", {
        type: "button",
        id: "settings-mobile-menu-trigger",
        onClick: handleClick,
        className: "inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] rounded-xl bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)] text-[var(--ds-text-primary)] shadow-lg shadow-black/20 hover:bg-white/10 active:bg-white/15 transition-colors touch-manipulation focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]",
        "aria-label": t("settingsMenu.openMenu"),
        children: [jsx(PanelLeft, {
          className: "w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0",
          "aria-hidden": true
        }), jsx("span", {
          className: "sr-only sm:not-sr-only sm:inline text-sm font-medium",
          children: t("nav.menu")
        })]
      })
    }), jsx("div", {
      className: "lg:hidden h-14 shrink-0",
      "aria-hidden": true
    })]
  });
}
const $$Astro = createAstro();
const $$SettingsLayout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SettingsLayout;
  const { title = "Paramètres - Popcorn Client" } = Astro2.props;
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": title }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-page settings-page flex min-h-full w-full min-h-0"> <aside data-astro-transition-persist="settings-sidebar" class="settings-sidebar-wrapper w-0 flex-shrink-0 lg:w-72 xl:w-80 h-full"> ${renderComponent($$result2, "SettingsSidebar", SettingsSidebar, { "client:load": true, "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/settings/SettingsSidebar", "client:component-export": "default" })} </aside> <div class="settings-content-area flex-1 min-w-0 min-h-0 overflow-x-hidden overflow-y-auto pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-3 sm:px-6 lg:px-6 pb-[env(safe-area-inset-bottom,0px)]"> ${renderComponent($$result2, "SettingsMobileMenuTrigger", SettingsMobileMenuTrigger, { "client:load": true, "client:component-hydration": "load", "client:component-path": "D:/Github/popcorn-client/src/components/settings/SettingsMobileMenuTrigger", "client:component-export": "default" })} ${renderSlot($$result2, $$slots["default"])} </div> </div> ` })}`;
}, "D:/Github/popcorn-client/src/layouts/SettingsLayout.astro", "self");
const $$Account = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Paramètres - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "SettingsContent", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/SettingsContent", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/account.astro", void 0);
const $$file$p = "D:/Github/popcorn-client/src/pages/settings/account.astro";
const $$url$p = "/./settings/account.html";
const _page$p = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Account,
  file: $$file$p,
  url: $$url$p
}, Symbol.toStringTag, { value: "Module" }));
const page$p = () => _page$p;
const $$Audit = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Audit - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settings.audit", "subtitleKey": "settings.auditDescription", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "BackendAudit", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/BackendAudit", "client:component-export": "default" })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/audit.astro", void 0);
const $$file$o = "D:/Github/popcorn-client/src/pages/settings/audit.astro";
const $$url$o = "/./settings/audit.html";
const _page$o = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Audit,
  file: $$file$o,
  url: $$url$o
}, Symbol.toStringTag, { value: "Module" }));
const page$o = () => _page$o;
const $$Blacklist = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Liste noire - Popcorn" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "blacklist.title", "subtitleKey": "blacklist.description", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "BlacklistManager", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/BlacklistManager", "client:component-export": "default" })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/blacklist.astro", void 0);
const $$file$n = "D:/Github/popcorn-client/src/pages/settings/blacklist.astro";
const $$url$n = "/./settings/blacklist.html";
const _page$n = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Blacklist,
  file: $$file$n,
  url: $$url$n
}, Symbol.toStringTag, { value: "Module" }));
const page$n = () => _page$n;
const $$DebugSync = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Debug Sync - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsPages.debugSync.pageTitle", "subtitleKey": "settingsPages.debugSync.pageSubtitle", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.sync", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` <div class="space-y-6 sm:space-y-8"> ${renderComponent($$result3, "DebugSyncCheck", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/DebugSyncCheck", "client:component-export": "default" })} </div> ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/debug-sync.astro", void 0);
const $$file$m = "D:/Github/popcorn-client/src/pages/settings/debug-sync.astro";
const $$url$m = "/./settings/debug-sync.html";
const _page$m = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$DebugSync,
  file: $$file$m,
  url: $$url$m
}, Symbol.toStringTag, { value: "Module" }));
const page$m = () => _page$m;
const $$Diagnostics = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Diagnostics - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsPages.diagnostics.title", "subtitleKey": "settingsPages.diagnostics.healthSubtitle", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.server", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "BackendDiagnostics", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/BackendDiagnostics", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/diagnostics.astro", void 0);
const $$file$l = "D:/Github/popcorn-client/src/pages/settings/diagnostics.astro";
const $$url$l = "/./settings/diagnostics.html";
const _page$l = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Diagnostics,
  file: $$file$l,
  url: $$url$l
}, Symbol.toStringTag, { value: "Module" }));
const page$l = () => _page$l;
const $$DiscoverSliders = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Sliders de découverte - Popcorn" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "discover.sliders", "subtitleKey": "discover.description", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "DiscoverSlidersManager", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/DiscoverSlidersManager", "client:component-export": "default" })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/discover-sliders.astro", void 0);
const $$file$k = "D:/Github/popcorn-client/src/pages/settings/discover-sliders.astro";
const $$url$k = "/./settings/discover-sliders.html";
const _page$k = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$DiscoverSliders,
  file: $$file$k,
  url: $$url$k
}, Symbol.toStringTag, { value: "Module" }));
const page$k = () => _page$k;
const $$Favorites = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "À regarder plus tard - Popcorn" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "SettingsContent", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/SettingsContent", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/favorites.astro", void 0);
const $$file$j = "D:/Github/popcorn-client/src/pages/settings/favorites.astro";
const $$url$j = "/./settings/favorites.html";
const _page$j = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Favorites,
  file: $$file$j,
  url: $$url$j
}, Symbol.toStringTag, { value: "Module" }));
const page$j = () => _page$j;
const $$Feedback = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Feedback - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsPages.feedback.title", "subtitleKey": "settingsPages.feedback.subtitle", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.account", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "FeedbackChat", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/FeedbackChat", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/feedback.astro", void 0);
const $$file$i = "D:/Github/popcorn-client/src/pages/settings/feedback.astro";
const $$url$i = "/./settings/feedback.html";
const _page$i = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Feedback,
  file: $$file$i,
  url: $$url$i
}, Symbol.toStringTag, { value: "Module" }));
const page$i = () => _page$i;
const $$Friends = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Friends - Popcorn" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsPages.friends.title", "subtitleKey": "settingsPages.friends.subtitle", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.friends", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "FriendsManager", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/FriendsManager", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/friends.astro", void 0);
const $$file$h = "D:/Github/popcorn-client/src/pages/settings/friends.astro";
const $$url$h = "/./settings/friends.html";
const _page$h = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Friends,
  file: $$file$h,
  url: $$url$h
}, Symbol.toStringTag, { value: "Module" }));
const page$h = () => _page$h;
const $$IndexerDefinitions = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Définitions d'indexeurs - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsPages.indexerDefinitions.title", "subtitleKey": "settingsPages.indexerDefinitions.subtitle", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.indexers", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` <div class="ds-card"> <div class="ds-card-section"> ${renderComponent($$result3, "IndexerDefinitionsManager", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/IndexerDefinitionsManager", "client:component-export": "default" })} </div> </div> ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/indexer-definitions.astro", void 0);
const $$file$g = "D:/Github/popcorn-client/src/pages/settings/indexer-definitions.astro";
const $$url$g = "/./settings/indexer-definitions.html";
const _page$g = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$IndexerDefinitions,
  file: $$file$g,
  url: $$url$g
}, Symbol.toStringTag, { value: "Module" }));
const page$g = () => _page$g;
const $$Indexers = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Gestion des Indexers - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsPages.indexers.title", "subtitleKey": "settingsPages.indexers.subtitle", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.indexers", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "IndexersPageContent", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/IndexersPageContent", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/indexers.astro", void 0);
const $$file$f = "D:/Github/popcorn-client/src/pages/settings/indexers.astro";
const $$url$f = "/./settings/indexers.html";
const _page$f = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Indexers,
  file: $$file$f,
  url: $$url$f
}, Symbol.toStringTag, { value: "Module" }));
const page$f = () => _page$f;
const $$LibraryDisplay = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Affichage de la bibliothèque - Popcorn" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "interfaceSettings.librarySection", "subtitleKey": "interfaceSettings.librarySectionDescription", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "LibraryDisplaySettingsPanel", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/LibraryDisplaySettingsPanel", "client:component-export": "default" })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/library-display.astro", void 0);
const $$file$e = "D:/Github/popcorn-client/src/pages/settings/library-display.astro";
const $$url$e = "/./settings/library-display.html";
const _page$e = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$LibraryDisplay,
  file: $$file$e,
  url: $$url$e
}, Symbol.toStringTag, { value: "Module" }));
const page$e = () => _page$e;
const $$LibraryMedia = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Médias de la bibliothèque - Popcorn" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsMenu.libraryMedia.title", "subtitleKey": "settingsMenu.libraryMedia.description", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.server", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "LibraryMediaPanel", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/LibraryMediaPanel", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/library-media.astro", void 0);
const $$file$d = "D:/Github/popcorn-client/src/pages/settings/library-media.astro";
const $$url$d = "/./settings/library-media.html";
const _page$d = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$LibraryMedia,
  file: $$file$d,
  url: $$url$d
}, Symbol.toStringTag, { value: "Module" }));
const page$d = () => _page$d;
const $$LibrarySources = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Sources de la bibliothèque - Popcorn" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsMenu.librarySources.title", "subtitleKey": "settingsMenu.librarySources.description", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.server", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "LibrarySourcesPanel", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/LibrarySourcesPanel", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/library-sources.astro", void 0);
const $$file$c = "D:/Github/popcorn-client/src/pages/settings/library-sources.astro";
const $$url$c = "/./settings/library-sources.html";
const _page$c = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$LibrarySources,
  file: $$file$c,
  url: $$url$c
}, Symbol.toStringTag, { value: "Module" }));
const page$c = () => _page$c;
const $$Librqbit = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Client torrent - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsPages.librqbit.title", "subtitleKey": "settingsPages.librqbit.subtitle", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.server", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` <div class="space-y-6 sm:space-y-8"> ${renderComponent($$result3, "LibRbitSettings", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/LibRbitSettings", "client:component-export": "default" })} </div> ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/librqbit.astro", void 0);
const $$file$b = "D:/Github/popcorn-client/src/pages/settings/librqbit.astro";
const $$url$b = "/./settings/librqbit.html";
const _page$b = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Librqbit,
  file: $$file$b,
  url: $$url$b
}, Symbol.toStringTag, { value: "Module" }));
const page$b = () => _page$b;
const $$LocalUsers = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Utilisateurs locaux - Popcorn" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsMenu.localUsers.title", "subtitleKey": "settingsMenu.localUsers.description", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.local_users", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "LocalUsersManager", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/LocalUsersManager", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/local-users.astro", void 0);
const $$file$a = "D:/Github/popcorn-client/src/pages/settings/local-users.astro";
const $$url$a = "/./settings/local-users.html";
const _page$a = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$LocalUsers,
  file: $$file$a,
  url: $$url$a
}, Symbol.toStringTag, { value: "Module" }));
const page$a = () => _page$a;
const $$MediaPaths = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Chemins des médias - Popcorn" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsMenu.mediaPaths.title", "subtitleKey": "settingsMenu.mediaPaths.description", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.server", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "MediaPathsPanel", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/MediaPathsPanel", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/media-paths.astro", void 0);
const $$file$9 = "D:/Github/popcorn-client/src/pages/settings/media-paths.astro";
const $$url$9 = "/./settings/media-paths.html";
const _page$9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$MediaPaths,
  file: $$file$9,
  url: $$url$9
}, Symbol.toStringTag, { value: "Module" }));
const page$9 = () => _page$9;
const $$RequestsAdmin = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Gestion des demandes - Popcorn" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "requestsAdmin.title", "subtitleKey": "requestsAdmin.description", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" })} ${renderComponent($$result2, "RequestsAdminManager", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/RequestsAdminManager", "client:component-export": "default" })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/requests-admin.astro", void 0);
const $$file$8 = "D:/Github/popcorn-client/src/pages/settings/requests-admin.astro";
const $$url$8 = "/./settings/requests-admin.html";
const _page$8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$RequestsAdmin,
  file: $$file$8,
  url: $$url$8
}, Symbol.toStringTag, { value: "Module" }));
const page$8 = () => _page$8;
const $$Server = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Paramètres - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "SettingsContent", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/SettingsContent", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/server.astro", void 0);
const $$file$7 = "D:/Github/popcorn-client/src/pages/settings/server.astro";
const $$url$7 = "/./settings/server.html";
const _page$7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Server,
  file: $$file$7,
  url: $$url$7
}, Symbol.toStringTag, { value: "Module" }));
const page$7 = () => _page$7;
const $$Sync = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Synchronisation des Torrents - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="ds-container max-w-5xl py-6 px-4 sm:px-6"> ${renderComponent($$result2, "DsPageHeader", null, { "client:only": "preact", "titleKey": "settingsPages.sync.title", "subtitleKey": "settingsPages.sync.subtitle", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/DsPageHeader", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "TranslatedButton", null, { "client:only": "preact", "href": "/settings/indexers", "translationKey": "settingsPages.sync.configureIndexers", "className": "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--ds-radius-full)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] border border-[var(--ds-border)] hover:bg-white/10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/TranslatedButton", "client:component-export": "default" })} ` })} ${renderComponent($$result2, "PermissionGuard", null, { "client:only": "preact", "permission": "settings.sync", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/ui/PermissionGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` <div class="space-y-6"> ${renderComponent($$result3, "TorrentSyncManager", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/TorrentSyncManager", "client:component-export": "default" })} </div> ` })} </div> ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/sync.astro", void 0);
const $$file$6 = "D:/Github/popcorn-client/src/pages/settings/sync.astro";
const $$url$6 = "/./settings/sync.html";
const _page$6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Sync,
  file: $$file$6,
  url: $$url$6
}, Symbol.toStringTag, { value: "Module" }));
const page$6 = () => _page$6;
const $$UiPreferences = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Paramètres - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "SettingsContent", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/SettingsContent", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings/ui-preferences.astro", void 0);
const $$file$5 = "D:/Github/popcorn-client/src/pages/settings/ui-preferences.astro";
const $$url$5 = "/./settings/ui-preferences.html";
const _page$5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$UiPreferences,
  file: $$file$5,
  url: $$url$5
}, Symbol.toStringTag, { value: "Module" }));
const page$5 = () => _page$5;
const $$Settings = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SettingsLayout", $$SettingsLayout, { "title": "Paramètres - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "SettingsContent", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/settings/SettingsContent", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/settings.astro", void 0);
const $$file$4 = "D:/Github/popcorn-client/src/pages/settings.astro";
const $$url$4 = "/./settings.html";
const _page$4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Settings,
  file: $$file$4,
  url: $$url$4
}, Symbol.toStringTag, { value: "Module" }));
const page$4 = () => _page$4;
const $$Setup = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Configuration - Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Wizard", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/setup/Wizard", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/setup.astro", void 0);
const $$file$3 = "D:/Github/popcorn-client/src/pages/setup.astro";
const $$url$3 = "/./setup.html";
const _page$3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Setup,
  file: $$file$3,
  url: $$url$3
}, Symbol.toStringTag, { value: "Module" }));
const page$3 = () => _page$3;
const $$Torrents = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Torrent - Popcorn" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "MediaDetailRoute", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/torrents/MediaDetailPage/MediaDetailRoute", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/torrents.astro", void 0);
const $$file$2 = "D:/Github/popcorn-client/src/pages/torrents.astro";
const $$url$2 = "/./torrents.html";
const _page$2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Torrents,
  file: $$file$2,
  url: $$url$2
}, Symbol.toStringTag, { value: "Module" }));
const page$2 = () => _page$2;
var __freeze = Object.freeze;
var __defProp2 = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp2(cooked, "raw", { value: __freeze(raw || cooked.slice()) }));
var _a;
const $$WebosLauncher = createComponent(($$result, $$props, $$slots) => {
  const cloudClientBase = "https://client.popcornn.app";
  return renderTemplate(_a || (_a = __template(['<html lang="fr" data-theme="dark" data-webos-launcher="true"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Popcornn</title><style>\n    /* Design system (aligné avec design-system.css + global.css) */\n    :root {\n      --ds-surface: #1C1C1E;\n      --ds-surface-elevated: #2C2C2E;\n      --ds-accent-violet: #D1C4E9;\n      --ds-text-primary: #ffffff;\n      --ds-text-secondary: rgba(255, 255, 255, 0.65);\n      --ds-text-tertiary: rgba(255, 255, 255, 0.45);\n      --ds-text-on-accent: #1C1C1E;\n      --ds-border: rgba(255, 255, 255, 0.1);\n      --ds-radius-sm: 12px;\n      --ds-radius-md: 20px;\n      --ds-radius-lg: 32px;\n      --ds-space-4: 16px;\n      --ds-space-6: 24px;\n      --ds-space-8: 32px;\n      --page-bg: #12141a;\n    }\n    * { box-sizing: border-box; }\n    body {\n      margin: 0;\n      min-height: 100vh;\n      background: #12141a;\n      background: var(--page-bg);\n      color: #ffffff;\n      color: var(--ds-text-primary);\n      font-family: system-ui, -apple-system, sans-serif;\n      display: flex;\n      flex-direction: column;\n      align-items: center;\n      justify-content: center;\n      padding: var(--ds-space-8);\n    }\n    .webos-launcher-container {\n      width: 100%;\n      max-width: 32rem;\n    }\n    .webos-launcher-title {\n      font-size: 1.75rem;\n      font-weight: 700;\n      margin-bottom: var(--ds-space-6);\n      color: var(--ds-text-primary);\n      text-align: center;\n    }\n    .webos-launcher-choices {\n      display: flex;\n      flex-direction: column;\n      gap: var(--ds-space-4);\n    }\n    .webos-launcher-btn {\n      display: block;\n      width: 100%;\n      min-height: 52px;\n      padding: var(--ds-space-4) var(--ds-space-6);\n      font-size: 1.05rem;\n      font-weight: 500;\n      background: #2C2C2E;\n      background: var(--ds-surface-elevated);\n      color: #ffffff;\n      color: var(--ds-text-primary);\n      border: 1px solid rgba(255,255,255,0.1);\n      border: 1px solid var(--ds-border);\n      border-radius: var(--ds-radius-sm);\n      cursor: pointer;\n      text-align: center;\n      transition: background 0.15s, border-color 0.15s, transform 0.15s;\n    }\n    .webos-launcher-btn:hover,\n    .webos-launcher-btn:focus {\n      background: rgba(255, 255, 255, 0.08);\n      border-color: rgba(255, 255, 255, 0.2);\n      outline: none;\n    }\n    .webos-launcher-btn.btn-primary {\n      background: #D1C4E9;\n      background: var(--ds-accent-violet);\n      color: #1C1C1E;\n      color: var(--ds-text-on-accent);\n      border-color: #D1C4E9;\n      border-color: var(--ds-accent-violet);\n    }\n    .webos-launcher-btn.btn-primary:hover,\n    .webos-launcher-btn.btn-primary:focus {\n      background: rgba(209, 196, 233, 0.9);\n      border-color: var(--ds-accent-violet);\n    }\n    /* Focus télécommande : contour blanc bien visible (webOS) */\n    .webos-launcher-btn:focus-visible,\n    .webos-launcher-btn.webos-launcher-focused,\n    .webos-launcher-form input:focus-visible,\n    .webos-launcher-form input.webos-launcher-focused {\n      outline: 4px solid rgba(255, 255, 255, 0.9);\n      outline-offset: 2px;\n      box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.5);\n      border-radius: var(--ds-radius-sm);\n    }\n    .webos-launcher-form {\n      margin-top: var(--ds-space-4);\n      padding: var(--ds-space-6);\n      background: var(--ds-surface-elevated);\n      border-radius: var(--ds-radius-md);\n      border: 1px solid var(--ds-border);\n    }\n    .webos-launcher-form label {\n      display: block;\n      margin-bottom: var(--ds-space-4);\n      font-size: 0.95rem;\n      color: var(--ds-text-secondary);\n    }\n    .webos-launcher-form input {\n      width: 100%;\n      padding: var(--ds-space-4);\n      font-size: 1rem;\n      background: var(--ds-surface);\n      border: 1px solid var(--ds-border);\n      border-radius: var(--ds-radius-sm);\n      color: var(--ds-text-primary);\n    }\n    .webos-launcher-form input::placeholder {\n      color: var(--ds-text-tertiary);\n    }\n    .webos-launcher-form .hint {\n      font-size: 0.85rem;\n      color: var(--ds-text-tertiary);\n      margin-top: var(--ds-space-4);\n    }\n    .webos-launcher-form .actions {\n      margin-top: var(--ds-space-6);\n      display: flex;\n      gap: var(--ds-space-4);\n    }\n    .webos-launcher-form .actions .webos-launcher-btn { flex: 1; }\n    .webos-launcher-saved-url {\n      font-size: 0.9rem;\n      color: var(--ds-text-secondary);\n      word-break: break-all;\n      margin-bottom: var(--ds-space-4);\n    }\n    .webos-launcher-reset { margin-top: var(--ds-space-6); text-align: center; }\n    .webos-launcher-reset-btn {\n      background: none;\n      border: none;\n      color: var(--ds-text-tertiary);\n      color: rgba(255,255,255,0.45);\n      font-size: 0.9rem;\n      cursor: pointer;\n      text-decoration: underline;\n      padding: 0.5rem;\n    }\n    .webos-launcher-reset-btn:hover, .webos-launcher-reset-btn:focus, .webos-launcher-reset-btn.webos-launcher-focused {\n      color: var(--ds-text-secondary);\n      outline: 4px solid rgba(255, 255, 255, 0.5);\n      outline-offset: 2px;\n    }\n  </style>', `</head> <body class="webos-launcher-page"> <div class="webos-launcher-container"> <h1 class="webos-launcher-title">Popcornn</h1> <div class="webos-launcher-choices"> <button type="button" class="webos-launcher-btn btn-primary" id="btn-cloud" data-focusable tabindex="0">
Client cloud (popcornn.app)
</button> <div id="local-section"> <button type="button" class="webos-launcher-btn" id="btn-local" data-focusable tabindex="0">
Client local
</button> <button type="button" class="webos-launcher-btn" id="btn-edit-local" data-focusable tabindex="0" style="display: none;">
Modifier l'URL du client local
</button> <div class="webos-launcher-form" id="local-form" hidden> <div class="webos-launcher-saved-url" id="saved-url-label" hidden></div> <label for="local-url">URL du client (ex. http://192.168.1.100:4321)</label> <input type="url" id="local-url" placeholder="http://192.168.1.100:4321" autocomplete="off" data-focusable tabindex="0"> <p class="hint">Même réseau Wi‑Fi que la TV. Après connexion QR depuis le client cloud, l'URL peut être enregistrée automatiquement.</p> <div class="actions"> <button type="button" class="webos-launcher-btn" id="btn-cancel-local" data-focusable tabindex="0">Annuler</button> <button type="button" class="webos-launcher-btn btn-primary" id="btn-save-local" data-focusable tabindex="0">Enregistrer et ouvrir</button> </div> </div> </div> </div> <p class="webos-launcher-reset"> <button type="button" class="webos-launcher-reset-btn" id="btn-reset-choice" data-focusable tabindex="0">Réinitialiser : afficher ce choix à chaque ouverture</button> </p> </div> <script>(function(){`, "\n    (function() {\n      var WEBOS_LOCAL_CLIENT_KEY = 'webos_local_client_url';\n      var WEBOS_LAST_CHOICE_KEY = 'webos_launcher_last_choice';\n      var FOCUS_CLASS = 'webos-launcher-focused';\n\n      document.addEventListener('webOSRelaunch', function() { window.location.reload(); });\n      document.addEventListener('visibilitychange', function() {\n        if (document.visibilityState === 'visible' && (!document.body.innerHTML.trim() || document.body.children.length === 0)) {\n          window.location.reload();\n        }\n      });\n\n      function getLocalClientUrl() {\n        try { return (localStorage.getItem(WEBOS_LOCAL_CLIENT_KEY) || '').trim().replace(/\\/$/, ''); } catch (e) { return ''; }\n      }\n      function setLocalClientUrl(url) {\n        try {\n          var u = (url || '').trim().replace(/\\/$/, '');\n          if (u) localStorage.setItem(WEBOS_LOCAL_CLIENT_KEY, u);\n          else localStorage.removeItem(WEBOS_LOCAL_CLIENT_KEY);\n        } catch (e) {}\n      }\n      function getLastChoice() {\n        try { return (localStorage.getItem(WEBOS_LAST_CHOICE_KEY) || '').trim(); } catch (e) { return ''; }\n      }\n      function setLastChoice(choice) {\n        try { if (choice) localStorage.setItem(WEBOS_LAST_CHOICE_KEY, choice); else localStorage.removeItem(WEBOS_LAST_CHOICE_KEY); } catch (e) {}\n      }\n      function go(url) { if (url) window.location.href = url; }\n\n      var isCloudOrigin = window.location.hostname.indexOf('popcornn.app') !== -1;\n      var cloudUrl = isCloudOrigin ? '/' : (cloudClientBase + '/');\n      var showChooser = false;\n      try { showChooser = (window.location.search || '').indexOf('choose=1') !== -1; } catch (e) {}\n      var lastChoice = getLastChoice();\n      var localUrl = getLocalClientUrl();\n      if (!showChooser && lastChoice === 'cloud') { setLastChoice('cloud'); go(cloudUrl); return; }\n      if (!showChooser && lastChoice === 'local' && localUrl) { go(localUrl); return; }\n\n      var btnCloud = document.getElementById('btn-cloud');\n      var btnLocal = document.getElementById('btn-local');\n      var btnEditLocal = document.getElementById('btn-edit-local');\n      var localForm = document.getElementById('local-form');\n      var localInput = document.getElementById('local-url');\n      var savedUrlLabel = document.getElementById('saved-url-label');\n      var btnCancel = document.getElementById('btn-cancel-local');\n      var btnSave = document.getElementById('btn-save-local');\n      var btnResetChoice = document.getElementById('btn-reset-choice');\n\n      function updateEditButtonVisibility() {\n        btnEditLocal.style.display = getLocalClientUrl() ? 'block' : 'none';\n      }\n      updateEditButtonVisibility();\n\n      function getFocusables() {\n        var list = [];\n        var main = [btnCloud, btnLocal];\n        if (btnEditLocal.style.display !== 'none') main.push(btnEditLocal);\n        list = main.slice();\n        if (localForm && !localForm.hidden) {\n          list.push(localInput, btnCancel, btnSave);\n        }\n        if (btnResetChoice) list.push(btnResetChoice);\n        return list.filter(Boolean);\n      }\n\n      function moveFocus(direction) {\n        var focusables = getFocusables();\n        if (focusables.length === 0) return;\n        var current = document.activeElement;\n        var idx = focusables.indexOf(current);\n        if (idx === -1) { focusables[0].focus(); applyFocusClass(focusables[0]); return; }\n        if (direction === 'next') idx = (idx + 1) % focusables.length;\n        else idx = idx - 1;\n        if (idx < 0) idx = focusables.length - 1;\n        focusables[idx].focus();\n        applyFocusClass(focusables[idx]);\n      }\n\n      function applyFocusClass(el) {\n        document.querySelectorAll('.' + FOCUS_CLASS).forEach(function(e) { e.classList.remove(FOCUS_CLASS); });\n        if (el) el.classList.add(FOCUS_CLASS);\n      }\n\n      function handleKey(e) {\n        var key = e.key;\n        var code = e.keyCode || e.which;\n        var isDown = (key === 'ArrowDown' || key === 'ArrowRight' || code === 40 || code === 39);\n        var isUp = (key === 'ArrowUp' || key === 'ArrowLeft' || code === 38 || code === 37);\n        var isEnter = (key === 'Enter' || code === 13);\n        var isBack = (key === 'Escape' || key === 'Backspace' || code === 27 || code === 8 || code === 461 || code === 10009);\n        if (isDown) { e.preventDefault(); e.stopPropagation(); moveFocus('next'); return; }\n        if (isUp) { e.preventDefault(); e.stopPropagation(); moveFocus('prev'); return; }\n        if (isEnter && document.activeElement && document.activeElement !== localInput) {\n          e.preventDefault(); e.stopPropagation(); document.activeElement.click(); return;\n        }\n        if (isBack && localForm && !localForm.hidden) { e.preventDefault(); showLocalForm(false); }\n      }\n      document.addEventListener('keydown', handleKey, true);\n\n      [btnCloud, btnLocal, btnEditLocal, localInput, btnCancel, btnSave, btnResetChoice].forEach(function(el) {\n        if (!el) return;\n        el.addEventListener('focus', function() { applyFocusClass(el); });\n        el.addEventListener('blur', function() { el.classList.remove(FOCUS_CLASS); });\n      });\n      if (btnResetChoice) {\n        btnResetChoice.addEventListener('click', function() {\n          setLastChoice('');\n          window.location.reload();\n        });\n      }\n\n      btnCloud.addEventListener('click', function() { setLastChoice('cloud'); go(cloudUrl); });\n      function showLocalForm(show) {\n        localForm.hidden = !show;\n        if (show) {\n          var saved = getLocalClientUrl();\n          if (saved) {\n            savedUrlLabel.textContent = 'URL enregistrée : ' + saved;\n            savedUrlLabel.hidden = false;\n            localInput.value = saved;\n          } else {\n            savedUrlLabel.hidden = true;\n            localInput.value = '';\n          }\n          localInput.focus();\n          applyFocusClass(localInput);\n        } else {\n          updateEditButtonVisibility();\n          btnLocal.focus();\n          applyFocusClass(btnLocal);\n        }\n      }\n      btnLocal.addEventListener('click', function() {\n        var saved = getLocalClientUrl();\n        if (saved) { setLastChoice('local'); go(saved); }\n        else showLocalForm(true);\n      });\n      btnEditLocal.addEventListener('click', function() { showLocalForm(true); });\n      btnCancel.addEventListener('click', function() { showLocalForm(false); });\n      function isValidUrl(s) {\n        s = (s || '').trim();\n        return s && (s.indexOf('http://') === 0 || s.indexOf('https://') === 0);\n      }\n      btnSave.addEventListener('click', function() {\n        var url = (localInput.value || '').trim().replace(/\\/$/, '');\n        if (!isValidUrl(url)) {\n          alert('Indiquez une URL commençant par http:// ou https://');\n          return;\n        }\n        setLocalClientUrl(url);\n        setLastChoice('local');\n        go(url);\n      });\n      localInput.addEventListener('keydown', function(e) {\n        if (e.key === 'Enter') { e.preventDefault(); btnSave.click(); }\n        if (e.key === 'Escape') { e.preventDefault(); btnCancel.click(); }\n      });\n\n      setTimeout(function() {\n        var first = getFocusables()[0];\n        if (first) { first.focus(); applyFocusClass(first); }\n      }, 100);\n    })();\n  })();<\/script> </body> </html>"], ['<html lang="fr" data-theme="dark" data-webos-launcher="true"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Popcornn</title><style>\n    /* Design system (aligné avec design-system.css + global.css) */\n    :root {\n      --ds-surface: #1C1C1E;\n      --ds-surface-elevated: #2C2C2E;\n      --ds-accent-violet: #D1C4E9;\n      --ds-text-primary: #ffffff;\n      --ds-text-secondary: rgba(255, 255, 255, 0.65);\n      --ds-text-tertiary: rgba(255, 255, 255, 0.45);\n      --ds-text-on-accent: #1C1C1E;\n      --ds-border: rgba(255, 255, 255, 0.1);\n      --ds-radius-sm: 12px;\n      --ds-radius-md: 20px;\n      --ds-radius-lg: 32px;\n      --ds-space-4: 16px;\n      --ds-space-6: 24px;\n      --ds-space-8: 32px;\n      --page-bg: #12141a;\n    }\n    * { box-sizing: border-box; }\n    body {\n      margin: 0;\n      min-height: 100vh;\n      background: #12141a;\n      background: var(--page-bg);\n      color: #ffffff;\n      color: var(--ds-text-primary);\n      font-family: system-ui, -apple-system, sans-serif;\n      display: flex;\n      flex-direction: column;\n      align-items: center;\n      justify-content: center;\n      padding: var(--ds-space-8);\n    }\n    .webos-launcher-container {\n      width: 100%;\n      max-width: 32rem;\n    }\n    .webos-launcher-title {\n      font-size: 1.75rem;\n      font-weight: 700;\n      margin-bottom: var(--ds-space-6);\n      color: var(--ds-text-primary);\n      text-align: center;\n    }\n    .webos-launcher-choices {\n      display: flex;\n      flex-direction: column;\n      gap: var(--ds-space-4);\n    }\n    .webos-launcher-btn {\n      display: block;\n      width: 100%;\n      min-height: 52px;\n      padding: var(--ds-space-4) var(--ds-space-6);\n      font-size: 1.05rem;\n      font-weight: 500;\n      background: #2C2C2E;\n      background: var(--ds-surface-elevated);\n      color: #ffffff;\n      color: var(--ds-text-primary);\n      border: 1px solid rgba(255,255,255,0.1);\n      border: 1px solid var(--ds-border);\n      border-radius: var(--ds-radius-sm);\n      cursor: pointer;\n      text-align: center;\n      transition: background 0.15s, border-color 0.15s, transform 0.15s;\n    }\n    .webos-launcher-btn:hover,\n    .webos-launcher-btn:focus {\n      background: rgba(255, 255, 255, 0.08);\n      border-color: rgba(255, 255, 255, 0.2);\n      outline: none;\n    }\n    .webos-launcher-btn.btn-primary {\n      background: #D1C4E9;\n      background: var(--ds-accent-violet);\n      color: #1C1C1E;\n      color: var(--ds-text-on-accent);\n      border-color: #D1C4E9;\n      border-color: var(--ds-accent-violet);\n    }\n    .webos-launcher-btn.btn-primary:hover,\n    .webos-launcher-btn.btn-primary:focus {\n      background: rgba(209, 196, 233, 0.9);\n      border-color: var(--ds-accent-violet);\n    }\n    /* Focus télécommande : contour blanc bien visible (webOS) */\n    .webos-launcher-btn:focus-visible,\n    .webos-launcher-btn.webos-launcher-focused,\n    .webos-launcher-form input:focus-visible,\n    .webos-launcher-form input.webos-launcher-focused {\n      outline: 4px solid rgba(255, 255, 255, 0.9);\n      outline-offset: 2px;\n      box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.5);\n      border-radius: var(--ds-radius-sm);\n    }\n    .webos-launcher-form {\n      margin-top: var(--ds-space-4);\n      padding: var(--ds-space-6);\n      background: var(--ds-surface-elevated);\n      border-radius: var(--ds-radius-md);\n      border: 1px solid var(--ds-border);\n    }\n    .webos-launcher-form label {\n      display: block;\n      margin-bottom: var(--ds-space-4);\n      font-size: 0.95rem;\n      color: var(--ds-text-secondary);\n    }\n    .webos-launcher-form input {\n      width: 100%;\n      padding: var(--ds-space-4);\n      font-size: 1rem;\n      background: var(--ds-surface);\n      border: 1px solid var(--ds-border);\n      border-radius: var(--ds-radius-sm);\n      color: var(--ds-text-primary);\n    }\n    .webos-launcher-form input::placeholder {\n      color: var(--ds-text-tertiary);\n    }\n    .webos-launcher-form .hint {\n      font-size: 0.85rem;\n      color: var(--ds-text-tertiary);\n      margin-top: var(--ds-space-4);\n    }\n    .webos-launcher-form .actions {\n      margin-top: var(--ds-space-6);\n      display: flex;\n      gap: var(--ds-space-4);\n    }\n    .webos-launcher-form .actions .webos-launcher-btn { flex: 1; }\n    .webos-launcher-saved-url {\n      font-size: 0.9rem;\n      color: var(--ds-text-secondary);\n      word-break: break-all;\n      margin-bottom: var(--ds-space-4);\n    }\n    .webos-launcher-reset { margin-top: var(--ds-space-6); text-align: center; }\n    .webos-launcher-reset-btn {\n      background: none;\n      border: none;\n      color: var(--ds-text-tertiary);\n      color: rgba(255,255,255,0.45);\n      font-size: 0.9rem;\n      cursor: pointer;\n      text-decoration: underline;\n      padding: 0.5rem;\n    }\n    .webos-launcher-reset-btn:hover, .webos-launcher-reset-btn:focus, .webos-launcher-reset-btn.webos-launcher-focused {\n      color: var(--ds-text-secondary);\n      outline: 4px solid rgba(255, 255, 255, 0.5);\n      outline-offset: 2px;\n    }\n  </style>', `</head> <body class="webos-launcher-page"> <div class="webos-launcher-container"> <h1 class="webos-launcher-title">Popcornn</h1> <div class="webos-launcher-choices"> <button type="button" class="webos-launcher-btn btn-primary" id="btn-cloud" data-focusable tabindex="0">
Client cloud (popcornn.app)
</button> <div id="local-section"> <button type="button" class="webos-launcher-btn" id="btn-local" data-focusable tabindex="0">
Client local
</button> <button type="button" class="webos-launcher-btn" id="btn-edit-local" data-focusable tabindex="0" style="display: none;">
Modifier l'URL du client local
</button> <div class="webos-launcher-form" id="local-form" hidden> <div class="webos-launcher-saved-url" id="saved-url-label" hidden></div> <label for="local-url">URL du client (ex. http://192.168.1.100:4321)</label> <input type="url" id="local-url" placeholder="http://192.168.1.100:4321" autocomplete="off" data-focusable tabindex="0"> <p class="hint">Même réseau Wi‑Fi que la TV. Après connexion QR depuis le client cloud, l'URL peut être enregistrée automatiquement.</p> <div class="actions"> <button type="button" class="webos-launcher-btn" id="btn-cancel-local" data-focusable tabindex="0">Annuler</button> <button type="button" class="webos-launcher-btn btn-primary" id="btn-save-local" data-focusable tabindex="0">Enregistrer et ouvrir</button> </div> </div> </div> </div> <p class="webos-launcher-reset"> <button type="button" class="webos-launcher-reset-btn" id="btn-reset-choice" data-focusable tabindex="0">Réinitialiser : afficher ce choix à chaque ouverture</button> </p> </div> <script>(function(){`, "\n    (function() {\n      var WEBOS_LOCAL_CLIENT_KEY = 'webos_local_client_url';\n      var WEBOS_LAST_CHOICE_KEY = 'webos_launcher_last_choice';\n      var FOCUS_CLASS = 'webos-launcher-focused';\n\n      document.addEventListener('webOSRelaunch', function() { window.location.reload(); });\n      document.addEventListener('visibilitychange', function() {\n        if (document.visibilityState === 'visible' && (!document.body.innerHTML.trim() || document.body.children.length === 0)) {\n          window.location.reload();\n        }\n      });\n\n      function getLocalClientUrl() {\n        try { return (localStorage.getItem(WEBOS_LOCAL_CLIENT_KEY) || '').trim().replace(/\\\\/$/, ''); } catch (e) { return ''; }\n      }\n      function setLocalClientUrl(url) {\n        try {\n          var u = (url || '').trim().replace(/\\\\/$/, '');\n          if (u) localStorage.setItem(WEBOS_LOCAL_CLIENT_KEY, u);\n          else localStorage.removeItem(WEBOS_LOCAL_CLIENT_KEY);\n        } catch (e) {}\n      }\n      function getLastChoice() {\n        try { return (localStorage.getItem(WEBOS_LAST_CHOICE_KEY) || '').trim(); } catch (e) { return ''; }\n      }\n      function setLastChoice(choice) {\n        try { if (choice) localStorage.setItem(WEBOS_LAST_CHOICE_KEY, choice); else localStorage.removeItem(WEBOS_LAST_CHOICE_KEY); } catch (e) {}\n      }\n      function go(url) { if (url) window.location.href = url; }\n\n      var isCloudOrigin = window.location.hostname.indexOf('popcornn.app') !== -1;\n      var cloudUrl = isCloudOrigin ? '/' : (cloudClientBase + '/');\n      var showChooser = false;\n      try { showChooser = (window.location.search || '').indexOf('choose=1') !== -1; } catch (e) {}\n      var lastChoice = getLastChoice();\n      var localUrl = getLocalClientUrl();\n      if (!showChooser && lastChoice === 'cloud') { setLastChoice('cloud'); go(cloudUrl); return; }\n      if (!showChooser && lastChoice === 'local' && localUrl) { go(localUrl); return; }\n\n      var btnCloud = document.getElementById('btn-cloud');\n      var btnLocal = document.getElementById('btn-local');\n      var btnEditLocal = document.getElementById('btn-edit-local');\n      var localForm = document.getElementById('local-form');\n      var localInput = document.getElementById('local-url');\n      var savedUrlLabel = document.getElementById('saved-url-label');\n      var btnCancel = document.getElementById('btn-cancel-local');\n      var btnSave = document.getElementById('btn-save-local');\n      var btnResetChoice = document.getElementById('btn-reset-choice');\n\n      function updateEditButtonVisibility() {\n        btnEditLocal.style.display = getLocalClientUrl() ? 'block' : 'none';\n      }\n      updateEditButtonVisibility();\n\n      function getFocusables() {\n        var list = [];\n        var main = [btnCloud, btnLocal];\n        if (btnEditLocal.style.display !== 'none') main.push(btnEditLocal);\n        list = main.slice();\n        if (localForm && !localForm.hidden) {\n          list.push(localInput, btnCancel, btnSave);\n        }\n        if (btnResetChoice) list.push(btnResetChoice);\n        return list.filter(Boolean);\n      }\n\n      function moveFocus(direction) {\n        var focusables = getFocusables();\n        if (focusables.length === 0) return;\n        var current = document.activeElement;\n        var idx = focusables.indexOf(current);\n        if (idx === -1) { focusables[0].focus(); applyFocusClass(focusables[0]); return; }\n        if (direction === 'next') idx = (idx + 1) % focusables.length;\n        else idx = idx - 1;\n        if (idx < 0) idx = focusables.length - 1;\n        focusables[idx].focus();\n        applyFocusClass(focusables[idx]);\n      }\n\n      function applyFocusClass(el) {\n        document.querySelectorAll('.' + FOCUS_CLASS).forEach(function(e) { e.classList.remove(FOCUS_CLASS); });\n        if (el) el.classList.add(FOCUS_CLASS);\n      }\n\n      function handleKey(e) {\n        var key = e.key;\n        var code = e.keyCode || e.which;\n        var isDown = (key === 'ArrowDown' || key === 'ArrowRight' || code === 40 || code === 39);\n        var isUp = (key === 'ArrowUp' || key === 'ArrowLeft' || code === 38 || code === 37);\n        var isEnter = (key === 'Enter' || code === 13);\n        var isBack = (key === 'Escape' || key === 'Backspace' || code === 27 || code === 8 || code === 461 || code === 10009);\n        if (isDown) { e.preventDefault(); e.stopPropagation(); moveFocus('next'); return; }\n        if (isUp) { e.preventDefault(); e.stopPropagation(); moveFocus('prev'); return; }\n        if (isEnter && document.activeElement && document.activeElement !== localInput) {\n          e.preventDefault(); e.stopPropagation(); document.activeElement.click(); return;\n        }\n        if (isBack && localForm && !localForm.hidden) { e.preventDefault(); showLocalForm(false); }\n      }\n      document.addEventListener('keydown', handleKey, true);\n\n      [btnCloud, btnLocal, btnEditLocal, localInput, btnCancel, btnSave, btnResetChoice].forEach(function(el) {\n        if (!el) return;\n        el.addEventListener('focus', function() { applyFocusClass(el); });\n        el.addEventListener('blur', function() { el.classList.remove(FOCUS_CLASS); });\n      });\n      if (btnResetChoice) {\n        btnResetChoice.addEventListener('click', function() {\n          setLastChoice('');\n          window.location.reload();\n        });\n      }\n\n      btnCloud.addEventListener('click', function() { setLastChoice('cloud'); go(cloudUrl); });\n      function showLocalForm(show) {\n        localForm.hidden = !show;\n        if (show) {\n          var saved = getLocalClientUrl();\n          if (saved) {\n            savedUrlLabel.textContent = 'URL enregistrée : ' + saved;\n            savedUrlLabel.hidden = false;\n            localInput.value = saved;\n          } else {\n            savedUrlLabel.hidden = true;\n            localInput.value = '';\n          }\n          localInput.focus();\n          applyFocusClass(localInput);\n        } else {\n          updateEditButtonVisibility();\n          btnLocal.focus();\n          applyFocusClass(btnLocal);\n        }\n      }\n      btnLocal.addEventListener('click', function() {\n        var saved = getLocalClientUrl();\n        if (saved) { setLastChoice('local'); go(saved); }\n        else showLocalForm(true);\n      });\n      btnEditLocal.addEventListener('click', function() { showLocalForm(true); });\n      btnCancel.addEventListener('click', function() { showLocalForm(false); });\n      function isValidUrl(s) {\n        s = (s || '').trim();\n        return s && (s.indexOf('http://') === 0 || s.indexOf('https://') === 0);\n      }\n      btnSave.addEventListener('click', function() {\n        var url = (localInput.value || '').trim().replace(/\\\\/$/, '');\n        if (!isValidUrl(url)) {\n          alert('Indiquez une URL commençant par http:// ou https://');\n          return;\n        }\n        setLocalClientUrl(url);\n        setLastChoice('local');\n        go(url);\n      });\n      localInput.addEventListener('keydown', function(e) {\n        if (e.key === 'Enter') { e.preventDefault(); btnSave.click(); }\n        if (e.key === 'Escape') { e.preventDefault(); btnCancel.click(); }\n      });\n\n      setTimeout(function() {\n        var first = getFocusables()[0];\n        if (first) { first.focus(); applyFocusClass(first); }\n      }, 100);\n    })();\n  })();<\/script> </body> </html>"])), renderHead(), defineScriptVars({ cloudClientBase }));
}, "D:/Github/popcorn-client/src/pages/webos-launcher.astro", void 0);
const $$file$1 = "D:/Github/popcorn-client/src/pages/webos-launcher.astro";
const $$url$1 = "/./webos-launcher.html";
const _page$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$WebosLauncher,
  file: $$file$1,
  url: $$url$1
}, Symbol.toStringTag, { value: "Module" }));
const page$1 = () => _page$1;
const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Popcorn Client" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "IndexRedirect", null, { "client:only": "preact", "client:component-hydration": "only", "client:component-path": "D:/Github/popcorn-client/src/components/IndexRedirect", "client:component-export": "default" })} ` })}`;
}, "D:/Github/popcorn-client/src/pages/index.astro", void 0);
const $$file = "D:/Github/popcorn-client/src/pages/index.astro";
const $$url = "/..html";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
const NOOP_MIDDLEWARE_FN = async (_ctx, next) => {
  const response = await next();
  response.headers.set(NOOP_MIDDLEWARE_HEADER, "true");
  return response;
};
const codeToStatusMap = {
  // Implemented from IANA HTTP Status Code Registry
  // https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  CONTENT_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_CONTENT: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  NETWORK_AUTHENTICATION_REQUIRED: 511
};
Object.entries(codeToStatusMap).reduce(
  // reverse the key-value pairs
  (acc, [key, value]) => __spreadProps(__spreadValues({}, acc), { [value]: key }),
  {}
);
function sanitizeParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, value.normalize().replace(/#/g, "%23").replace(/\?/g, "%3F")];
      }
      return [key, value];
    })
  );
}
function getParameter(part, params) {
  if (part.spread) {
    return params[part.content.slice(3)] || "";
  }
  if (part.dynamic) {
    if (!params[part.content]) {
      throw new TypeError(`Missing parameter: ${part.content}`);
    }
    return params[part.content];
  }
  return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]");
}
function getSegment(segment, params) {
  const segmentPath = segment.map((part) => getParameter(part, params)).join("");
  return segmentPath ? "/" + segmentPath : "";
}
function getRouteGenerator(segments, addTrailingSlash) {
  return (params) => {
    const sanitizedParams = sanitizeParams(params);
    let trailing = "";
    if (addTrailingSlash === "always" && segments.length) {
      trailing = "/";
    }
    const path = segments.map((segment) => getSegment(segment, sanitizedParams)).join("") + trailing;
    return path || "/";
  };
}
function deserializeRouteData(rawRouteData) {
  return {
    route: rawRouteData.route,
    type: rawRouteData.type,
    pattern: new RegExp(rawRouteData.pattern),
    params: rawRouteData.params,
    component: rawRouteData.component,
    generate: getRouteGenerator(rawRouteData.segments, rawRouteData._meta.trailingSlash),
    pathname: rawRouteData.pathname || void 0,
    segments: rawRouteData.segments,
    prerender: rawRouteData.prerender,
    redirect: rawRouteData.redirect,
    redirectRoute: rawRouteData.redirectRoute ? deserializeRouteData(rawRouteData.redirectRoute) : void 0,
    fallbackRoutes: rawRouteData.fallbackRoutes.map((fallback) => {
      return deserializeRouteData(fallback);
    }),
    isIndex: rawRouteData.isIndex,
    origin: rawRouteData.origin
  };
}
function deserializeManifest(serializedManifest) {
  const routes = [];
  for (const serializedRoute of serializedManifest.routes) {
    routes.push(__spreadProps(__spreadValues({}, serializedRoute), {
      routeData: deserializeRouteData(serializedRoute.routeData)
    }));
    const route = serializedRoute;
    route.routeData = deserializeRouteData(serializedRoute.routeData);
  }
  const assets = new Set(serializedManifest.assets);
  const componentMetadata = new Map(serializedManifest.componentMetadata);
  const inlinedScripts = new Map(serializedManifest.inlinedScripts);
  const clientDirectives = new Map(serializedManifest.clientDirectives);
  const serverIslandNameMap = new Map(serializedManifest.serverIslandNameMap);
  const key = decodeKey(serializedManifest.key);
  return __spreadProps(__spreadValues({
    // in case user middleware exists, this no-op middleware will be reassigned (see plugin-ssr.ts)
    middleware() {
      return { onRequest: NOOP_MIDDLEWARE_FN };
    }
  }, serializedManifest), {
    assets,
    componentMetadata,
    inlinedScripts,
    clientDirectives,
    routes,
    serverIslandNameMap,
    key
  });
}
const manifest = deserializeManifest({"hrefRoot":"file:///D:/Github/popcorn-client/","cacheDir":"file:///D:/Github/popcorn-client/node_modules/.astro/","outDir":"file:///D:/Github/popcorn-client/dist/","srcDir":"file:///D:/Github/popcorn-client/src/","publicDir":"file:///D:/Github/popcorn-client/public/","buildClientDir":"file:///D:/Github/popcorn-client/dist/client/","buildServerDir":"file:///D:/Github/popcorn-client/dist/server/","adapterName":"","routes":[{"file":"file:///D:/Github/popcorn-client/dist/403.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/403","isIndex":false,"type":"page","pattern":"^\\/403$","segments":[[{"content":"403","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/403.astro","pathname":"/403","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/404.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/404","isIndex":false,"type":"page","pattern":"^\\/404$","segments":[[{"content":"404","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/404.astro","pathname":"/404","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/500.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/500","isIndex":false,"type":"page","pattern":"^\\/500$","segments":[[{"content":"500","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/500.astro","pathname":"/500","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/dashboard.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/dashboard","isIndex":false,"type":"page","pattern":"^\\/dashboard$","segments":[[{"content":"dashboard","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/dashboard.astro","pathname":"/dashboard","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/demandes.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/demandes","isIndex":false,"type":"page","pattern":"^\\/demandes$","segments":[[{"content":"demandes","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/demandes.astro","pathname":"/demandes","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/demo.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/demo","isIndex":false,"type":"page","pattern":"^\\/demo$","segments":[[{"content":"demo","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/demo.astro","pathname":"/demo","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/disclaimer.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/disclaimer","isIndex":false,"type":"page","pattern":"^\\/disclaimer$","segments":[[{"content":"disclaimer","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/disclaimer.astro","pathname":"/disclaimer","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/discover.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/discover","isIndex":false,"type":"page","pattern":"^\\/discover$","segments":[[{"content":"discover","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/discover.astro","pathname":"/discover","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/downloads.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/downloads","isIndex":false,"type":"page","pattern":"^\\/downloads$","segments":[[{"content":"downloads","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/downloads.astro","pathname":"/downloads","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/features.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/features","isIndex":false,"type":"page","pattern":"^\\/features$","segments":[[{"content":"features","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/features.astro","pathname":"/features","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/films.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/films","isIndex":false,"type":"page","pattern":"^\\/films$","segments":[[{"content":"films","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/films.astro","pathname":"/films","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/installation.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/installation","isIndex":false,"type":"page","pattern":"^\\/installation$","segments":[[{"content":"installation","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/installation.astro","pathname":"/installation","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/login.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/login","isIndex":false,"type":"page","pattern":"^\\/login$","segments":[[{"content":"login","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/login.astro","pathname":"/login","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/player.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/player","isIndex":false,"type":"page","pattern":"^\\/player$","segments":[[{"content":"player","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/player.astro","pathname":"/player","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/register.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/register","isIndex":false,"type":"page","pattern":"^\\/register$","segments":[[{"content":"register","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/register.astro","pathname":"/register","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/requests.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/requests","isIndex":false,"type":"page","pattern":"^\\/requests$","segments":[[{"content":"requests","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/requests.astro","pathname":"/requests","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/search.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/search","isIndex":false,"type":"page","pattern":"^\\/search$","segments":[[{"content":"search","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/search.astro","pathname":"/search","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/series.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/series","isIndex":false,"type":"page","pattern":"^\\/series$","segments":[[{"content":"series","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/series.astro","pathname":"/series","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/account.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/account","isIndex":false,"type":"page","pattern":"^\\/settings\\/account$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"account","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/account.astro","pathname":"/settings/account","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/audit.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/audit","isIndex":false,"type":"page","pattern":"^\\/settings\\/audit$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"audit","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/audit.astro","pathname":"/settings/audit","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/blacklist.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/blacklist","isIndex":false,"type":"page","pattern":"^\\/settings\\/blacklist$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"blacklist","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/blacklist.astro","pathname":"/settings/blacklist","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/debug-sync.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/debug-sync","isIndex":false,"type":"page","pattern":"^\\/settings\\/debug-sync$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"debug-sync","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/debug-sync.astro","pathname":"/settings/debug-sync","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/diagnostics.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/diagnostics","isIndex":false,"type":"page","pattern":"^\\/settings\\/diagnostics$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"diagnostics","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/diagnostics.astro","pathname":"/settings/diagnostics","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/discover-sliders.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/discover-sliders","isIndex":false,"type":"page","pattern":"^\\/settings\\/discover-sliders$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"discover-sliders","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/discover-sliders.astro","pathname":"/settings/discover-sliders","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/favorites.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/favorites","isIndex":false,"type":"page","pattern":"^\\/settings\\/favorites$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"favorites","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/favorites.astro","pathname":"/settings/favorites","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/feedback.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/feedback","isIndex":false,"type":"page","pattern":"^\\/settings\\/feedback$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"feedback","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/feedback.astro","pathname":"/settings/feedback","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/friends.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/friends","isIndex":false,"type":"page","pattern":"^\\/settings\\/friends$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"friends","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/friends.astro","pathname":"/settings/friends","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/indexer-definitions.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/indexer-definitions","isIndex":false,"type":"page","pattern":"^\\/settings\\/indexer-definitions$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"indexer-definitions","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/indexer-definitions.astro","pathname":"/settings/indexer-definitions","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/indexers.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/indexers","isIndex":false,"type":"page","pattern":"^\\/settings\\/indexers$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"indexers","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/indexers.astro","pathname":"/settings/indexers","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/library-display.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/library-display","isIndex":false,"type":"page","pattern":"^\\/settings\\/library-display$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"library-display","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/library-display.astro","pathname":"/settings/library-display","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/library-media.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/library-media","isIndex":false,"type":"page","pattern":"^\\/settings\\/library-media$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"library-media","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/library-media.astro","pathname":"/settings/library-media","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/library-sources.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/library-sources","isIndex":false,"type":"page","pattern":"^\\/settings\\/library-sources$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"library-sources","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/library-sources.astro","pathname":"/settings/library-sources","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/librqbit.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/librqbit","isIndex":false,"type":"page","pattern":"^\\/settings\\/librqbit$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"librqbit","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/librqbit.astro","pathname":"/settings/librqbit","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/local-users.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/local-users","isIndex":false,"type":"page","pattern":"^\\/settings\\/local-users$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"local-users","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/local-users.astro","pathname":"/settings/local-users","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/media-paths.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/media-paths","isIndex":false,"type":"page","pattern":"^\\/settings\\/media-paths$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"media-paths","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/media-paths.astro","pathname":"/settings/media-paths","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/requests-admin.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/requests-admin","isIndex":false,"type":"page","pattern":"^\\/settings\\/requests-admin$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"requests-admin","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/requests-admin.astro","pathname":"/settings/requests-admin","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/server.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/server","isIndex":false,"type":"page","pattern":"^\\/settings\\/server$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"server","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/server.astro","pathname":"/settings/server","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/sync.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/sync","isIndex":false,"type":"page","pattern":"^\\/settings\\/sync$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"sync","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/sync.astro","pathname":"/settings/sync","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings/ui-preferences.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings/ui-preferences","isIndex":false,"type":"page","pattern":"^\\/settings\\/ui-preferences$","segments":[[{"content":"settings","dynamic":false,"spread":false}],[{"content":"ui-preferences","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings/ui-preferences.astro","pathname":"/settings/ui-preferences","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/settings.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings","isIndex":false,"type":"page","pattern":"^\\/settings$","segments":[[{"content":"settings","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings.astro","pathname":"/settings","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/setup.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/setup","isIndex":false,"type":"page","pattern":"^\\/setup$","segments":[[{"content":"setup","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/setup.astro","pathname":"/setup","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/torrents.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/torrents","isIndex":false,"type":"page","pattern":"^\\/torrents$","segments":[[{"content":"torrents","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/torrents.astro","pathname":"/torrents","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/webos-launcher.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/webos-launcher","isIndex":false,"type":"page","pattern":"^\\/webos-launcher$","segments":[[{"content":"webos-launcher","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/webos-launcher.astro","pathname":"/webos-launcher","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}},{"file":"file:///D:/Github/popcorn-client/dist/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/","isIndex":true,"type":"page","pattern":"^$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"never"}}}],"base":"/.","trailingSlash":"never","compressHTML":true,"componentMetadata":[["D:/Github/popcorn-client/src/pages/403.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/404.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/500.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/account.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/audit.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/blacklist.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/debug-sync.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/diagnostics.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/discover-sliders.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/favorites.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/feedback.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/friends.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/indexer-definitions.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/indexers.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/library-display.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/library-media.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/library-sources.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/librqbit.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/local-users.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/media-paths.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/requests-admin.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/server.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/sync.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/settings/ui-preferences.astro",{"propagation":"in-tree","containsHead":true}],["D:/Github/popcorn-client/src/pages/dashboard.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/demandes.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/demo.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/disclaimer.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/discover.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/downloads.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/features.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/films.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/index.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/installation.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/login.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/register.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/requests.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/search.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/series.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/setup.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/torrents.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/pages/player.astro",{"propagation":"none","containsHead":true}],["D:/Github/popcorn-client/src/layouts/SettingsLayout.astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/account@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/audit@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/blacklist@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/debug-sync@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/diagnostics@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/discover-sliders@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/favorites@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/feedback@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/friends@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/indexer-definitions@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/indexers@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/library-display@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/library-media@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/library-sources@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/librqbit@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/local-users@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/media-paths@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/requests-admin@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/server@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/sync@_@astro",{"propagation":"in-tree","containsHead":false}],["\u0000@astro-page:src/pages/settings/ui-preferences@_@astro",{"propagation":"in-tree","containsHead":false}],["D:/Github/popcorn-client/src/pages/webos-launcher.astro",{"propagation":"none","containsHead":true}]],"renderers":[],"clientDirectives":[["idle","(()=>{var l=(n,t)=>{let i=async()=>{await(await n())()},e=typeof t.value==\"object\"?t.value:void 0,s={timeout:e==null?void 0:e.timeout};\"requestIdleCallback\"in window?window.requestIdleCallback(i,s):setTimeout(i,s.timeout||200)};(self.Astro||(self.Astro={})).idle=l;window.dispatchEvent(new Event(\"astro:idle\"));})();"],["load","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).load=e;window.dispatchEvent(new Event(\"astro:load\"));})();"],["media","(()=>{var n=(a,t)=>{let i=async()=>{await(await a())()};if(t.value){let e=matchMedia(t.value);e.matches?i():e.addEventListener(\"change\",i,{once:!0})}};(self.Astro||(self.Astro={})).media=n;window.dispatchEvent(new Event(\"astro:media\"));})();"],["only","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).only=e;window.dispatchEvent(new Event(\"astro:only\"));})();"],["visible","(()=>{var a=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value==\"object\"?i.value:void 0,c={rootMargin:t==null?void 0:t.rootMargin},n=new IntersectionObserver(e=>{for(let l of e)if(l.isIntersecting){n.disconnect(),r();break}},c);for(let e of o.children)n.observe(e)};(self.Astro||(self.Astro={})).visible=a;window.dispatchEvent(new Event(\"astro:visible\"));})();"]],"entryModules":{"\u0000@astro-renderers":"renderers.mjs","\u0000noop-middleware":"_noop-middleware.mjs","\u0000virtual:astro:actions/noop-entrypoint":"noop-entrypoint.mjs","\u0000@astro-page:src/pages/403@_@astro":"pages/403.astro.mjs","\u0000@astro-page:src/pages/404@_@astro":"pages/404.astro.mjs","\u0000@astro-page:src/pages/500@_@astro":"pages/500.astro.mjs","\u0000@astro-page:src/pages/dashboard@_@astro":"pages/dashboard.astro.mjs","\u0000@astro-page:src/pages/demandes@_@astro":"pages/demandes.astro.mjs","\u0000@astro-page:src/pages/demo@_@astro":"pages/demo.astro.mjs","\u0000@astro-page:src/pages/disclaimer@_@astro":"pages/disclaimer.astro.mjs","\u0000@astro-page:src/pages/discover@_@astro":"pages/discover.astro.mjs","\u0000@astro-page:src/pages/downloads@_@astro":"pages/downloads.astro.mjs","\u0000@astro-page:src/pages/features@_@astro":"pages/features.astro.mjs","\u0000@astro-page:src/pages/films@_@astro":"pages/films.astro.mjs","\u0000@astro-page:src/pages/installation@_@astro":"pages/installation.astro.mjs","\u0000@astro-page:src/pages/login@_@astro":"pages/login.astro.mjs","\u0000@astro-page:src/pages/player@_@astro":"pages/player.astro.mjs","\u0000@astro-page:src/pages/register@_@astro":"pages/register.astro.mjs","\u0000@astro-page:src/pages/requests@_@astro":"pages/requests.astro.mjs","\u0000@astro-page:src/pages/search@_@astro":"pages/search.astro.mjs","\u0000@astro-page:src/pages/series@_@astro":"pages/series.astro.mjs","\u0000@astro-page:src/pages/settings/account@_@astro":"pages/settings/account.astro.mjs","\u0000@astro-page:src/pages/settings/audit@_@astro":"pages/settings/audit.astro.mjs","\u0000@astro-page:src/pages/settings/blacklist@_@astro":"pages/settings/blacklist.astro.mjs","\u0000@astro-page:src/pages/settings/debug-sync@_@astro":"pages/settings/debug-sync.astro.mjs","\u0000@astro-page:src/pages/settings/diagnostics@_@astro":"pages/settings/diagnostics.astro.mjs","\u0000@astro-page:src/pages/settings/discover-sliders@_@astro":"pages/settings/discover-sliders.astro.mjs","\u0000@astro-page:src/pages/settings/favorites@_@astro":"pages/settings/favorites.astro.mjs","\u0000@astro-page:src/pages/settings/feedback@_@astro":"pages/settings/feedback.astro.mjs","\u0000@astro-page:src/pages/settings/friends@_@astro":"pages/settings/friends.astro.mjs","\u0000@astro-page:src/pages/settings/indexer-definitions@_@astro":"pages/settings/indexer-definitions.astro.mjs","\u0000@astro-page:src/pages/settings/indexers@_@astro":"pages/settings/indexers.astro.mjs","\u0000@astro-page:src/pages/settings/library-display@_@astro":"pages/settings/library-display.astro.mjs","\u0000@astro-page:src/pages/settings/library-media@_@astro":"pages/settings/library-media.astro.mjs","\u0000@astro-page:src/pages/settings/library-sources@_@astro":"pages/settings/library-sources.astro.mjs","\u0000@astro-page:src/pages/settings/librqbit@_@astro":"pages/settings/librqbit.astro.mjs","\u0000@astro-page:src/pages/settings/local-users@_@astro":"pages/settings/local-users.astro.mjs","\u0000@astro-page:src/pages/settings/media-paths@_@astro":"pages/settings/media-paths.astro.mjs","\u0000@astro-page:src/pages/settings/requests-admin@_@astro":"pages/settings/requests-admin.astro.mjs","\u0000@astro-page:src/pages/settings/server@_@astro":"pages/settings/server.astro.mjs","\u0000@astro-page:src/pages/settings/sync@_@astro":"pages/settings/sync.astro.mjs","\u0000@astro-page:src/pages/settings/ui-preferences@_@astro":"pages/settings/ui-preferences.astro.mjs","\u0000@astro-page:src/pages/settings@_@astro":"pages/settings.astro.mjs","\u0000@astro-page:src/pages/setup@_@astro":"pages/setup.astro.mjs","\u0000@astro-page:src/pages/torrents@_@astro":"pages/torrents.astro.mjs","\u0000@astro-page:src/pages/webos-launcher@_@astro":"pages/webos-launcher.astro.mjs","\u0000@astro-page:src/pages/index@_@astro":"pages/index.astro.mjs","\u0000@astrojs-manifest":"manifest_DhCqMrPD.mjs","D:/Github/popcorn-client/src/components/errors/ErrorPage":"_assets/ErrorPage.js","D:/Github/popcorn-client/src/components/FeatureCard":"_assets/FeatureCard.js","D:/Github/popcorn-client/src/components/LoginForm":"_assets/LoginForm.js","D:/Github/popcorn-client/src/components/RegisterForm":"_assets/RegisterForm.js","D:/Github/popcorn-client/src/components/settings/SettingsSidebar":"_assets/SettingsSidebar.js","D:/Github/popcorn-client/src/components/settings/SettingsMobileMenuTrigger":"_assets/SettingsMobileMenuTrigger.js","D:/Github/popcorn-client/src/components/dashboard/Dashboard":"_assets/Dashboard.js","D:/Github/popcorn-client/src/components/demandes/DemandesPage":"_assets/DemandesPage.js","D:/Github/popcorn-client/src/components/DemoEntry":"_assets/DemoEntry.js","D:/Github/popcorn-client/src/components/discover/DiscoverMediaDetailRoute":"_assets/DiscoverMediaDetailRoute.js","D:/Github/popcorn-client/src/components/downloads/DownloadsList":"_assets/DownloadsList.js","D:/Github/popcorn-client/src/components/dashboard/FilmsDashboard":"_assets/FilmsDashboard.js","D:/Github/popcorn-client/src/components/requests/MyRequests":"_assets/MyRequests.js","D:/Github/popcorn-client/src/components/Search":"_assets/Search.js","D:/Github/popcorn-client/src/components/dashboard/SeriesDashboard":"_assets/SeriesDashboard.js","D:/Github/popcorn-client/src/components/ui/DsPageHeader":"_assets/DsPageHeader.js","D:/Github/popcorn-client/src/components/settings/BackendAudit":"_assets/BackendAudit.js","D:/Github/popcorn-client/src/components/settings/SettingsContent":"_assets/SettingsContent.js","D:/Github/popcorn-client/src/components/settings/BlacklistManager":"_assets/BlacklistManager.js","D:/Github/popcorn-client/src/components/ui/PermissionGuard":"_assets/PermissionGuard.js","D:/Github/popcorn-client/src/components/settings/DebugSyncCheck":"_assets/DebugSyncCheck.js","D:/Github/popcorn-client/src/components/settings/BackendDiagnostics":"_assets/BackendDiagnostics.js","D:/Github/popcorn-client/src/components/settings/DiscoverSlidersManager":"_assets/DiscoverSlidersManager.js","D:/Github/popcorn-client/src/components/settings/FeedbackChat":"_assets/FeedbackChat.js","D:/Github/popcorn-client/src/components/settings/FriendsManager":"_assets/FriendsManager.js","D:/Github/popcorn-client/src/components/settings/IndexerDefinitionsManager":"_assets/IndexerDefinitionsManager.js","D:/Github/popcorn-client/src/components/settings/IndexersPageContent":"_assets/IndexersPageContent.js","D:/Github/popcorn-client/src/components/settings/LibraryDisplaySettingsPanel":"_assets/LibraryDisplaySettingsPanel.js","D:/Github/popcorn-client/src/components/settings/LibraryMediaPanel":"_assets/LibraryMediaPanel.js","D:/Github/popcorn-client/src/components/settings/LibrarySourcesPanel":"_assets/LibrarySourcesPanel.js","D:/Github/popcorn-client/src/components/settings/LibRbitSettings":"_assets/LibRbitSettings.js","D:/Github/popcorn-client/src/components/settings/LocalUsersManager":"_assets/LocalUsersManager.js","D:/Github/popcorn-client/src/components/settings/MediaPathsPanel":"_assets/MediaPathsPanel.js","D:/Github/popcorn-client/src/components/settings/RequestsAdminManager":"_assets/RequestsAdminManager.js","D:/Github/popcorn-client/src/components/ui/TranslatedButton":"_assets/TranslatedButton.js","D:/Github/popcorn-client/src/components/settings/TorrentSyncManager":"_assets/TorrentSyncManager.js","D:/Github/popcorn-client/src/components/setup/Wizard":"_assets/Wizard.js","D:/Github/popcorn-client/src/components/torrents/MediaDetailPage/MediaDetailRoute":"_assets/MediaDetailRoute.js","D:/Github/popcorn-client/src/components/IndexRedirect":"_assets/IndexRedirect.js","D:/Github/popcorn-client/src/components/tv/TVNavigationProvider":"_assets/TVNavigationProvider.js","D:/Github/popcorn-client/src/components/ServerConnectionCheck":"_assets/ServerConnectionCheck.js","D:/Github/popcorn-client/src/components/layout/Navbar":"_assets/Navbar.js","D:/Github/popcorn-client/src/components/layout/FeedbackFAB":"_assets/FeedbackFAB.js","@astrojs/preact/client.js":"_assets/client.js","D:/Github/popcorn-client/src/pages/installation.astro?astro&type=script&index=0&lang.ts":"_assets/installation.astro_astro_type_script_index_0_lang.js","D:/Github/popcorn-client/node_modules/astro/components/ClientRouter.astro?astro&type=script&index=0&lang.ts":"_assets/ClientRouter.astro_astro_type_script_index_0_lang.js","astro:scripts/before-hydration.js":""},"inlinedScripts":[],"assets":["/./file:///D:/Github/popcorn-client/dist/403.html","/./file:///D:/Github/popcorn-client/dist/404.html","/./file:///D:/Github/popcorn-client/dist/500.html","/./file:///D:/Github/popcorn-client/dist/dashboard.html","/./file:///D:/Github/popcorn-client/dist/demandes.html","/./file:///D:/Github/popcorn-client/dist/demo.html","/./file:///D:/Github/popcorn-client/dist/disclaimer.html","/./file:///D:/Github/popcorn-client/dist/discover.html","/./file:///D:/Github/popcorn-client/dist/downloads.html","/./file:///D:/Github/popcorn-client/dist/features.html","/./file:///D:/Github/popcorn-client/dist/films.html","/./file:///D:/Github/popcorn-client/dist/installation.html","/./file:///D:/Github/popcorn-client/dist/login.html","/./file:///D:/Github/popcorn-client/dist/player.html","/./file:///D:/Github/popcorn-client/dist/register.html","/./file:///D:/Github/popcorn-client/dist/requests.html","/./file:///D:/Github/popcorn-client/dist/search.html","/./file:///D:/Github/popcorn-client/dist/series.html","/./file:///D:/Github/popcorn-client/dist/settings/account.html","/./file:///D:/Github/popcorn-client/dist/settings/audit.html","/./file:///D:/Github/popcorn-client/dist/settings/blacklist.html","/./file:///D:/Github/popcorn-client/dist/settings/debug-sync.html","/./file:///D:/Github/popcorn-client/dist/settings/diagnostics.html","/./file:///D:/Github/popcorn-client/dist/settings/discover-sliders.html","/./file:///D:/Github/popcorn-client/dist/settings/favorites.html","/./file:///D:/Github/popcorn-client/dist/settings/feedback.html","/./file:///D:/Github/popcorn-client/dist/settings/friends.html","/./file:///D:/Github/popcorn-client/dist/settings/indexer-definitions.html","/./file:///D:/Github/popcorn-client/dist/settings/indexers.html","/./file:///D:/Github/popcorn-client/dist/settings/library-display.html","/./file:///D:/Github/popcorn-client/dist/settings/library-media.html","/./file:///D:/Github/popcorn-client/dist/settings/library-sources.html","/./file:///D:/Github/popcorn-client/dist/settings/librqbit.html","/./file:///D:/Github/popcorn-client/dist/settings/local-users.html","/./file:///D:/Github/popcorn-client/dist/settings/media-paths.html","/./file:///D:/Github/popcorn-client/dist/settings/requests-admin.html","/./file:///D:/Github/popcorn-client/dist/settings/server.html","/./file:///D:/Github/popcorn-client/dist/settings/sync.html","/./file:///D:/Github/popcorn-client/dist/settings/ui-preferences.html","/./file:///D:/Github/popcorn-client/dist/settings.html","/./file:///D:/Github/popcorn-client/dist/setup.html","/./file:///D:/Github/popcorn-client/dist/torrents.html","/./file:///D:/Github/popcorn-client/dist/webos-launcher.html","/./file:///D:/Github/popcorn-client/dist/index.html"],"buildFormat":"file","checkOrigin":false,"allowedDomains":[],"serverIslandNameMap":[],"key":"iMNIjfXwkRTvpfHtcOs+WDLRK75TjKdasyMyUqp8h9E="});
if (manifest.sessionConfig) manifest.sessionConfig.driverModule = null;
export {
  page$j as A,
  page$i as B,
  page$h as C,
  page$g as D,
  page$f as E,
  page$e as F,
  page$d as G,
  page$c as H,
  page$b as I,
  page$a as J,
  page$9 as K,
  page$8 as L,
  page$7 as M,
  page$6 as N,
  page$5 as O,
  page$4 as P,
  page$3 as Q,
  page$2 as R,
  page$1 as S,
  page as T,
  manifest as U,
  page$G as a,
  page$F as b,
  page$E as c,
  page$D as d,
  page$C as e,
  page$B as f,
  page$A as g,
  page$z as h,
  page$y as i,
  page$x as j,
  page$w as k,
  page$v as l,
  page$u as m,
  page$t as n,
  onRequest as o,
  page$H as p,
  page$s as q,
  page$r as r,
  renderers,
  server as s,
  page$q as t,
  page$p as u,
  page$o as v,
  page$n as w,
  page$m as x,
  page$l as y,
  page$k as z
};
