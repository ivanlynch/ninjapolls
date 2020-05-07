var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    function create_animation(node, from, fn, params) {
        if (!from)
            return noop;
        const to = node.getBoundingClientRect();
        if (from.left === to.left && from.right === to.right && from.top === to.top && from.bottom === to.bottom)
            return noop;
        const { delay = 0, duration = 300, easing = identity, 
        // @ts-ignore todo: should this be separated from destructuring? Or start/end added to public api and documentation?
        start: start_time = now() + delay, 
        // @ts-ignore todo:
        end = start_time + duration, tick = noop, css } = fn(node, { from, to }, params);
        let running = true;
        let started = false;
        let name;
        function start() {
            if (css) {
                name = create_rule(node, 0, 1, duration, delay, easing, css);
            }
            if (!delay) {
                started = true;
            }
        }
        function stop() {
            if (css)
                delete_rule(node, name);
            running = false;
        }
        loop(now => {
            if (!started && now >= start_time) {
                started = true;
            }
            if (started && now >= end) {
                tick(1, 0);
                stop();
            }
            if (!running) {
                return false;
            }
            if (started) {
                const p = now - start_time;
                const t = 0 + 1 * easing(p / duration);
                tick(t, 1 - t);
            }
            return true;
        });
        start();
        tick(0, 1);
        return stop;
    }
    function fix_position(node) {
        const style = getComputedStyle(node);
        if (style.position !== 'absolute' && style.position !== 'fixed') {
            const { width, height } = style;
            const a = node.getBoundingClientRect();
            node.style.position = 'absolute';
            node.style.width = width;
            node.style.height = height;
            add_transform(node, a);
        }
    }
    function add_transform(node, a) {
        const b = node.getBoundingClientRect();
        if (a.left !== b.left || a.top !== b.top) {
            const style = getComputedStyle(node);
            const transform = style.transform === 'none' ? '' : style.transform;
            node.style.transform = `${transform} translate(${a.left - b.left}px, ${a.top - b.top}px)`;
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function fix_and_outro_and_destroy_block(block, lookup) {
        block.f();
        outro_and_destroy_block(block, lookup);
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next, lookup.has(block.key));
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const PollStore = writable([
        {
            id: 1,
            question: 'Python or JavaScript?',
            answerA: 'Python',
            answerB: 'JavaScript',
            votesA: 9,
            votesB: 15
        }
    ]);

    /* src/components/Header.svelte generated by Svelte v3.22.2 */

    function create_fragment(ctx) {
    	let header;

    	return {
    		c() {
    			header = element("header");
    			header.innerHTML = `<h1 class="svelte-x5xntk"><img src="/img/poll_ninja_logo.svg" alt="Pollo ninja logo" class="svelte-x5xntk"></h1>`;
    			attr(header, "class", "svelte-x5xntk");
    		},
    		m(target, anchor) {
    			insert(target, header, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(header);
    		}
    	};
    }

    class Header extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment, safe_not_equal, {});
    	}
    }

    /* src/components/Footer.svelte generated by Svelte v3.22.2 */

    function create_fragment$1(ctx) {
    	let footer;

    	return {
    		c() {
    			footer = element("footer");

    			footer.innerHTML = `<div class="copyright svelte-1k8sho9">
        Copyright 2020 Poll Ninja
    </div>`;

    			attr(footer, "class", "svelte-1k8sho9");
    		},
    		m(target, anchor) {
    			insert(target, footer, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(footer);
    		}
    	};
    }

    class Footer extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$1, safe_not_equal, {});
    	}
    }

    /* src/shared/Button.svelte generated by Svelte v3.22.2 */

    function create_fragment$2(ctx) {
    	let button;
    	let button_class_value;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

    	return {
    		c() {
    			button = element("button");
    			if (default_slot) default_slot.c();
    			attr(button, "class", button_class_value = "" + (null_to_empty(/*type*/ ctx[0]) + " svelte-18q22jq"));
    			toggle_class(button, "flat", /*flat*/ ctx[1]);
    			toggle_class(button, "inverse", /*inverse*/ ctx[2]);
    		},
    		m(target, anchor, remount) {
    			insert(target, button, anchor);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen(button, "click", /*click_handler*/ ctx[5]);
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 8) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
    				}
    			}

    			if (!current || dirty & /*type*/ 1 && button_class_value !== (button_class_value = "" + (null_to_empty(/*type*/ ctx[0]) + " svelte-18q22jq"))) {
    				attr(button, "class", button_class_value);
    			}

    			if (dirty & /*type, flat*/ 3) {
    				toggle_class(button, "flat", /*flat*/ ctx[1]);
    			}

    			if (dirty & /*type, inverse*/ 5) {
    				toggle_class(button, "inverse", /*inverse*/ ctx[2]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (default_slot) default_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { type = "primary" } = $$props;
    	let { flat = false } = $$props;
    	let { inverse = false } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("type" in $$props) $$invalidate(0, type = $$props.type);
    		if ("flat" in $$props) $$invalidate(1, flat = $$props.flat);
    		if ("inverse" in $$props) $$invalidate(2, inverse = $$props.inverse);
    		if ("$$scope" in $$props) $$invalidate(3, $$scope = $$props.$$scope);
    	};

    	return [type, flat, inverse, $$scope, $$slots, click_handler];
    }

    class Button extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment$2, safe_not_equal, { type: 0, flat: 1, inverse: 2 });
    	}
    }

    /* src/components/CreatePollForm.svelte generated by Svelte v3.22.2 */

    function create_default_slot(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Add Poll");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let form;
    	let div1;
    	let label0;
    	let t1;
    	let input0;
    	let t2;
    	let div0;
    	let t3_value = /*errors*/ ctx[1].question + "";
    	let t3;
    	let t4;
    	let div3;
    	let label1;
    	let t6;
    	let input1;
    	let t7;
    	let div2;
    	let t8_value = /*errors*/ ctx[1].answerA + "";
    	let t8;
    	let t9;
    	let div5;
    	let label2;
    	let t11;
    	let input2;
    	let t12;
    	let div4;
    	let t13_value = /*errors*/ ctx[1].answerB + "";
    	let t13;
    	let t14;
    	let current;
    	let dispose;

    	const button = new Button({
    			props: {
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			form = element("form");
    			div1 = element("div");
    			label0 = element("label");
    			label0.textContent = "Poll Question:";
    			t1 = space();
    			input0 = element("input");
    			t2 = space();
    			div0 = element("div");
    			t3 = text(t3_value);
    			t4 = space();
    			div3 = element("div");
    			label1 = element("label");
    			label1.textContent = "Answer A:";
    			t6 = space();
    			input1 = element("input");
    			t7 = space();
    			div2 = element("div");
    			t8 = text(t8_value);
    			t9 = space();
    			div5 = element("div");
    			label2 = element("label");
    			label2.textContent = "Answer B:";
    			t11 = space();
    			input2 = element("input");
    			t12 = space();
    			div4 = element("div");
    			t13 = text(t13_value);
    			t14 = space();
    			create_component(button.$$.fragment);
    			attr(label0, "for", "question");
    			attr(label0, "class", "svelte-1ub4sem");
    			attr(input0, "type", "text");
    			attr(input0, "id", "question");
    			attr(input0, "class", "svelte-1ub4sem");
    			attr(div0, "class", "error svelte-1ub4sem");
    			attr(div1, "class", "form-field svelte-1ub4sem");
    			attr(label1, "for", "answer-a");
    			attr(label1, "class", "svelte-1ub4sem");
    			attr(input1, "type", "text");
    			attr(input1, "id", "answer-a");
    			attr(input1, "class", "svelte-1ub4sem");
    			attr(div2, "class", "error svelte-1ub4sem");
    			attr(div3, "class", "form-field svelte-1ub4sem");
    			attr(label2, "for", "answer-b");
    			attr(label2, "class", "svelte-1ub4sem");
    			attr(input2, "type", "text");
    			attr(input2, "id", "answer-b");
    			attr(input2, "class", "svelte-1ub4sem");
    			attr(div4, "class", "error svelte-1ub4sem");
    			attr(div5, "class", "form-field svelte-1ub4sem");
    			attr(form, "class", "svelte-1ub4sem");
    		},
    		m(target, anchor, remount) {
    			insert(target, form, anchor);
    			append(form, div1);
    			append(div1, label0);
    			append(div1, t1);
    			append(div1, input0);
    			set_input_value(input0, /*fields*/ ctx[0].question);
    			append(div1, t2);
    			append(div1, div0);
    			append(div0, t3);
    			append(form, t4);
    			append(form, div3);
    			append(div3, label1);
    			append(div3, t6);
    			append(div3, input1);
    			set_input_value(input1, /*fields*/ ctx[0].answerA);
    			append(div3, t7);
    			append(div3, div2);
    			append(div2, t8);
    			append(form, t9);
    			append(form, div5);
    			append(div5, label2);
    			append(div5, t11);
    			append(div5, input2);
    			set_input_value(input2, /*fields*/ ctx[0].answerB);
    			append(div5, t12);
    			append(div5, div4);
    			append(div4, t13);
    			append(form, t14);
    			mount_component(button, form, null);
    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(input0, "input", /*input0_input_handler*/ ctx[5]),
    				listen(input1, "input", /*input1_input_handler*/ ctx[6]),
    				listen(input2, "input", /*input2_input_handler*/ ctx[7]),
    				listen(form, "submit", prevent_default(/*submitHandler*/ ctx[2]))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*fields*/ 1 && input0.value !== /*fields*/ ctx[0].question) {
    				set_input_value(input0, /*fields*/ ctx[0].question);
    			}

    			if ((!current || dirty & /*errors*/ 2) && t3_value !== (t3_value = /*errors*/ ctx[1].question + "")) set_data(t3, t3_value);

    			if (dirty & /*fields*/ 1 && input1.value !== /*fields*/ ctx[0].answerA) {
    				set_input_value(input1, /*fields*/ ctx[0].answerA);
    			}

    			if ((!current || dirty & /*errors*/ 2) && t8_value !== (t8_value = /*errors*/ ctx[1].answerA + "")) set_data(t8, t8_value);

    			if (dirty & /*fields*/ 1 && input2.value !== /*fields*/ ctx[0].answerB) {
    				set_input_value(input2, /*fields*/ ctx[0].answerB);
    			}

    			if ((!current || dirty & /*errors*/ 2) && t13_value !== (t13_value = /*errors*/ ctx[1].answerB + "")) set_data(t13, t13_value);
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 256) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(form);
    			destroy_component(button);
    			run_all(dispose);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let dispatch = createEventDispatcher();
    	let fields = { question: "", answerA: "", answerB: "" };
    	let errors = { question: "", answerA: "", answerB: "" };
    	let valid = false;

    	const submitHandler = () => {
    		valid = true;

    		//Validate question
    		if (fields.question.trim().length < 5) {
    			valid = false;
    			$$invalidate(1, errors.question = "Question must be at least 5 characters long", errors);
    		} else {
    			$$invalidate(1, errors.question = "", errors);
    		}

    		//Validate answer A
    		if (fields.answerA.trim().length < 1) {
    			valid = false;
    			$$invalidate(1, errors.answerA = "Answer A cannot be empty", errors);
    		} else {
    			$$invalidate(1, errors.answerA = "", errors);
    		}

    		//Validate answer B
    		if (fields.answerB.trim().length < 1) {
    			valid = false;
    			$$invalidate(1, errors.answerB = "Answer B cannot be empty", errors);
    		} else {
    			$$invalidate(1, errors.answerB = "", errors);
    		}

    		//Add a new Poll
    		if (valid) {
    			let poll = {
    				...fields,
    				votesA: 0,
    				votesB: 0,
    				id: Math.random()
    			};

    			//Save
    			PollStore.update(currentPolls => {
    				return [poll, ...currentPolls];
    			});

    			dispatch("add");
    		}
    	};

    	function input0_input_handler() {
    		fields.question = this.value;
    		$$invalidate(0, fields);
    	}

    	function input1_input_handler() {
    		fields.answerA = this.value;
    		$$invalidate(0, fields);
    	}

    	function input2_input_handler() {
    		fields.answerB = this.value;
    		$$invalidate(0, fields);
    	}

    	return [
    		fields,
    		errors,
    		submitHandler,
    		valid,
    		dispatch,
    		input0_input_handler,
    		input1_input_handler,
    		input2_input_handler
    	];
    }

    class CreatePollForm extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$3, safe_not_equal, {});
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function scale(node, { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const sd = 1 - start;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `
			transform: ${transform} scale(${1 - (sd * u)});
			opacity: ${target_opacity - (od * u)}
		`
        };
    }

    function flip(node, animation, params) {
        const style = getComputedStyle(node);
        const transform = style.transform === 'none' ? '' : style.transform;
        const scaleX = animation.from.width / node.clientWidth;
        const scaleY = animation.from.height / node.clientHeight;
        const dx = (animation.from.left - animation.to.left) / scaleX;
        const dy = (animation.from.top - animation.to.top) / scaleY;
        const d = Math.sqrt(dx * dx + dy * dy);
        const { delay = 0, duration = (d) => Math.sqrt(d) * 120, easing = cubicOut } = params;
        return {
            delay,
            duration: is_function(duration) ? duration(d) : duration,
            easing,
            css: (_t, u) => `transform: ${transform} translate(${u * dx}px, ${u * dy}px);`
        };
    }

    /* src/shared/Card.svelte generated by Svelte v3.22.2 */

    function create_fragment$4(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[1].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[0], null);

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr(div, "class", "card svelte-a2wabe");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 1) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[0], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[0], dirty, null));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate(0, $$scope = $$props.$$scope);
    	};

    	return [$$scope, $$slots];
    }

    class Card extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$4, safe_not_equal, {});
    	}
    }

    function is_date(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    function get_interpolator(a, b) {
        if (a === b || a !== a)
            return () => a;
        const type = typeof a;
        if (type !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
            throw new Error('Cannot interpolate values of different type');
        }
        if (Array.isArray(a)) {
            const arr = b.map((bi, i) => {
                return get_interpolator(a[i], bi);
            });
            return t => arr.map(fn => fn(t));
        }
        if (type === 'object') {
            if (!a || !b)
                throw new Error('Object cannot be null');
            if (is_date(a) && is_date(b)) {
                a = a.getTime();
                b = b.getTime();
                const delta = b - a;
                return t => new Date(a + t * delta);
            }
            const keys = Object.keys(b);
            const interpolators = {};
            keys.forEach(key => {
                interpolators[key] = get_interpolator(a[key], b[key]);
            });
            return t => {
                const result = {};
                keys.forEach(key => {
                    result[key] = interpolators[key](t);
                });
                return result;
            };
        }
        if (type === 'number') {
            const delta = b - a;
            return t => a + t * delta;
        }
        throw new Error(`Cannot interpolate ${type} values`);
    }
    function tweened(value, defaults = {}) {
        const store = writable(value);
        let task;
        let target_value = value;
        function set(new_value, opts) {
            if (value == null) {
                store.set(value = new_value);
                return Promise.resolve();
            }
            target_value = new_value;
            let previous_task = task;
            let started = false;
            let { delay = 0, duration = 400, easing = identity, interpolate = get_interpolator } = assign(assign({}, defaults), opts);
            if (duration === 0) {
                store.set(target_value);
                return Promise.resolve();
            }
            const start = now() + delay;
            let fn;
            task = loop(now => {
                if (now < start)
                    return true;
                if (!started) {
                    fn = interpolate(value, new_value);
                    if (typeof duration === 'function')
                        duration = duration(value, new_value);
                    started = true;
                }
                if (previous_task) {
                    previous_task.abort();
                    previous_task = null;
                }
                const elapsed = now - start;
                if (elapsed > duration) {
                    store.set(value = new_value);
                    return false;
                }
                // @ts-ignore
                store.set(value = fn(easing(elapsed / duration)));
                return true;
            });
            return task.promise;
        }
        return {
            set,
            update: (fn, opts) => set(fn(target_value, value), opts),
            subscribe: store.subscribe
        };
    }

    /* src/components/PollDetails.svelte generated by Svelte v3.22.2 */

    function create_default_slot_1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Delete");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (87:0) <Card>
    function create_default_slot$1(ctx) {
    	let div5;
    	let h3;
    	let t0_value = /*poll*/ ctx[0].question + "";
    	let t0;
    	let t1;
    	let p;
    	let t2;
    	let t3;
    	let t4;
    	let div1;
    	let div0;
    	let t5;
    	let span0;
    	let t6_value = /*poll*/ ctx[0].answerA + "";
    	let t6;
    	let t7;
    	let t8_value = /*poll*/ ctx[0].votesA + "";
    	let t8;
    	let t9;
    	let t10;
    	let div3;
    	let div2;
    	let t11;
    	let span1;
    	let t12_value = /*poll*/ ctx[0].answerB + "";
    	let t12;
    	let t13;
    	let t14_value = /*poll*/ ctx[0].votesB + "";
    	let t14;
    	let t15;
    	let t16;
    	let div4;
    	let current;
    	let dispose;

    	const button = new Button({
    			props: {
    				flat: true,
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*click_handler_2*/ ctx[12]);

    	return {
    		c() {
    			div5 = element("div");
    			h3 = element("h3");
    			t0 = text(t0_value);
    			t1 = space();
    			p = element("p");
    			t2 = text("Total votes: ");
    			t3 = text(/*totalVotes*/ ctx[1]);
    			t4 = space();
    			div1 = element("div");
    			div0 = element("div");
    			t5 = space();
    			span0 = element("span");
    			t6 = text(t6_value);
    			t7 = text(" (");
    			t8 = text(t8_value);
    			t9 = text(")");
    			t10 = space();
    			div3 = element("div");
    			div2 = element("div");
    			t11 = space();
    			span1 = element("span");
    			t12 = text(t12_value);
    			t13 = text(" (");
    			t14 = text(t14_value);
    			t15 = text(")");
    			t16 = space();
    			div4 = element("div");
    			create_component(button.$$.fragment);
    			attr(h3, "class", "svelte-10ndtzm");
    			attr(p, "class", "svelte-10ndtzm");
    			attr(div0, "class", "percent percent-a svelte-10ndtzm");
    			set_style(div0, "width", /*$tweenedA*/ ctx[2] + "%");
    			attr(span0, "class", "svelte-10ndtzm");
    			attr(div1, "class", "answer svelte-10ndtzm");
    			attr(div2, "class", "percent percent-b svelte-10ndtzm");
    			set_style(div2, "width", /*$tweenedB*/ ctx[3] + "%");
    			attr(span1, "class", "svelte-10ndtzm");
    			attr(div3, "class", "answer svelte-10ndtzm");
    			attr(div4, "class", "delete svelte-10ndtzm");
    			attr(div5, "class", "poll");
    		},
    		m(target, anchor, remount) {
    			insert(target, div5, anchor);
    			append(div5, h3);
    			append(h3, t0);
    			append(div5, t1);
    			append(div5, p);
    			append(p, t2);
    			append(p, t3);
    			append(div5, t4);
    			append(div5, div1);
    			append(div1, div0);
    			append(div1, t5);
    			append(div1, span0);
    			append(span0, t6);
    			append(span0, t7);
    			append(span0, t8);
    			append(span0, t9);
    			append(div5, t10);
    			append(div5, div3);
    			append(div3, div2);
    			append(div3, t11);
    			append(div3, span1);
    			append(span1, t12);
    			append(span1, t13);
    			append(span1, t14);
    			append(span1, t15);
    			append(div5, t16);
    			append(div5, div4);
    			mount_component(button, div4, null);
    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(div1, "click", /*click_handler*/ ctx[10]),
    				listen(div3, "click", /*click_handler_1*/ ctx[11])
    			];
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty & /*poll*/ 1) && t0_value !== (t0_value = /*poll*/ ctx[0].question + "")) set_data(t0, t0_value);
    			if (!current || dirty & /*totalVotes*/ 2) set_data(t3, /*totalVotes*/ ctx[1]);

    			if (!current || dirty & /*$tweenedA*/ 4) {
    				set_style(div0, "width", /*$tweenedA*/ ctx[2] + "%");
    			}

    			if ((!current || dirty & /*poll*/ 1) && t6_value !== (t6_value = /*poll*/ ctx[0].answerA + "")) set_data(t6, t6_value);
    			if ((!current || dirty & /*poll*/ 1) && t8_value !== (t8_value = /*poll*/ ctx[0].votesA + "")) set_data(t8, t8_value);

    			if (!current || dirty & /*$tweenedB*/ 8) {
    				set_style(div2, "width", /*$tweenedB*/ ctx[3] + "%");
    			}

    			if ((!current || dirty & /*poll*/ 1) && t12_value !== (t12_value = /*poll*/ ctx[0].answerB + "")) set_data(t12, t12_value);
    			if ((!current || dirty & /*poll*/ 1) && t14_value !== (t14_value = /*poll*/ ctx[0].votesB + "")) set_data(t14, t14_value);
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div5);
    			destroy_component(button);
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let current;

    	const card = new Card({
    			props: {
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(card.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(card, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const card_changes = {};

    			if (dirty & /*$$scope, poll, $tweenedB, $tweenedA, totalVotes*/ 8207) {
    				card_changes.$$scope = { dirty, ctx };
    			}

    			card.$set(card_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(card.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(card.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(card, detaching);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $tweenedA;
    	let $tweenedB;
    	let { poll } = $$props;

    	//tween percentages
    	const tweenedA = tweened(0);

    	component_subscribe($$self, tweenedA, value => $$invalidate(2, $tweenedA = value));
    	const tweenedB = tweened(0);
    	component_subscribe($$self, tweenedB, value => $$invalidate(3, $tweenedB = value));

    	const handleVote = (option, id) => {
    		PollStore.update(currentPolls => {
    			let copiedPolls = [...currentPolls];
    			let upvotedPoll = copiedPolls.find(poll => poll.id == id);

    			if (option === "a") {
    				upvotedPoll.votesA++;
    			}

    			if (option === "b") {
    				upvotedPoll.votesB++;
    			}

    			return copiedPolls;
    		});
    	};

    	const handleDelete = id => {
    		PollStore.update(currentPolls => {
    			return currentPolls.filter(poll => poll.id != id);
    		});
    	};

    	const click_handler = () => handleVote("a", poll.id);
    	const click_handler_1 = () => handleVote("b", poll.id);
    	const click_handler_2 = () => handleDelete(poll.id);

    	$$self.$set = $$props => {
    		if ("poll" in $$props) $$invalidate(0, poll = $$props.poll);
    	};

    	let totalVotes;
    	let percentA;
    	let percentB;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*poll*/ 1) {
    			//reactive values
    			 $$invalidate(1, totalVotes = poll.votesA + poll.votesB);
    		}

    		if ($$self.$$.dirty & /*totalVotes, poll*/ 3) {
    			 $$invalidate(8, percentA = Math.floor(100 / totalVotes * poll.votesA) || 0);
    		}

    		if ($$self.$$.dirty & /*totalVotes, poll*/ 3) {
    			 $$invalidate(9, percentB = Math.floor(100 / totalVotes * poll.votesB) || 0);
    		}

    		if ($$self.$$.dirty & /*percentA*/ 256) {
    			 tweenedA.set(percentA);
    		}

    		if ($$self.$$.dirty & /*percentB*/ 512) {
    			 tweenedB.set(percentB);
    		}
    	};

    	return [
    		poll,
    		totalVotes,
    		$tweenedA,
    		$tweenedB,
    		tweenedA,
    		tweenedB,
    		handleVote,
    		handleDelete,
    		percentA,
    		percentB,
    		click_handler,
    		click_handler_1,
    		click_handler_2
    	];
    }

    class PollDetails extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$5, safe_not_equal, { poll: 0 });
    	}
    }

    /* src/components/PollList.svelte generated by Svelte v3.22.2 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[2] = list[i];
    	return child_ctx;
    }

    // (17:2) {#each $PollStore as poll (poll.id)}
    function create_each_block(key_1, ctx) {
    	let div;
    	let t;
    	let div_intro;
    	let div_outro;
    	let rect;
    	let stop_animation = noop;
    	let current;
    	const polldetails = new PollDetails({ props: { poll: /*poll*/ ctx[2] } });
    	polldetails.$on("vote", /*vote_handler*/ ctx[1]);

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			div = element("div");
    			create_component(polldetails.$$.fragment);
    			t = space();
    			this.first = div;
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(polldetails, div, null);
    			append(div, t);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const polldetails_changes = {};
    			if (dirty & /*$PollStore*/ 1) polldetails_changes.poll = /*poll*/ ctx[2];
    			polldetails.$set(polldetails_changes);
    		},
    		r() {
    			rect = div.getBoundingClientRect();
    		},
    		f() {
    			fix_position(div);
    			stop_animation();
    			add_transform(div, rect);
    		},
    		a() {
    			stop_animation();
    			stop_animation = create_animation(div, rect, flip, { duration: 500 });
    		},
    		i(local) {
    			if (current) return;
    			transition_in(polldetails.$$.fragment, local);

    			add_render_callback(() => {
    				if (div_outro) div_outro.end(1);
    				if (!div_intro) div_intro = create_in_transition(div, fade, {});
    				div_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			transition_out(polldetails.$$.fragment, local);
    			if (div_intro) div_intro.invalidate();

    			if (local) {
    				div_outro = create_out_transition(div, scale, {});
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(polldetails);
    			if (detaching && div_outro) div_outro.end();
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let div;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let each_value = /*$PollStore*/ ctx[0];
    	const get_key = ctx => /*poll*/ ctx[2].id;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(div, "class", "poll-list svelte-5ar2qy");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*$PollStore*/ 1) {
    				const each_value = /*$PollStore*/ ctx[0];
    				group_outros();
    				for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].r();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div, fix_and_outro_and_destroy_block, create_each_block, null, get_each_context);
    				for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].a();
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $PollStore;
    	component_subscribe($$self, PollStore, $$value => $$invalidate(0, $PollStore = $$value));

    	function vote_handler(event) {
    		bubble($$self, event);
    	}

    	return [$PollStore, vote_handler];
    }

    class PollList extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$6, safe_not_equal, {});
    	}
    }

    /* src/shared/Tabs.svelte generated by Svelte v3.22.2 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    // (10:8) {#each items as item}
    function create_each_block$1(ctx) {
    	let li;
    	let div;
    	let t0_value = /*item*/ ctx[4] + "";
    	let t0;
    	let t1;
    	let dispose;

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[3](/*item*/ ctx[4], ...args);
    	}

    	return {
    		c() {
    			li = element("li");
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			attr(div, "class", "svelte-lym58t");
    			toggle_class(div, "active", /*item*/ ctx[4] === /*activeItem*/ ctx[1]);
    			attr(li, "class", "svelte-lym58t");
    		},
    		m(target, anchor, remount) {
    			insert(target, li, anchor);
    			append(li, div);
    			append(div, t0);
    			append(li, t1);
    			if (remount) dispose();
    			dispose = listen(li, "click", click_handler);
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*items*/ 1 && t0_value !== (t0_value = /*item*/ ctx[4] + "")) set_data(t0, t0_value);

    			if (dirty & /*items, activeItem*/ 3) {
    				toggle_class(div, "active", /*item*/ ctx[4] === /*activeItem*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			dispose();
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	let div;
    	let ul;
    	let each_value = /*items*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	return {
    		c() {
    			div = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ul, "class", "svelte-lym58t");
    			attr(div, "class", "tabs svelte-lym58t");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*dispatch, items, activeItem*/ 7) {
    				each_value = /*items*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { items } = $$props;
    	let { activeItem } = $$props;
    	const click_handler = item => dispatch("tabChange", item);

    	$$self.$set = $$props => {
    		if ("items" in $$props) $$invalidate(0, items = $$props.items);
    		if ("activeItem" in $$props) $$invalidate(1, activeItem = $$props.activeItem);
    	};

    	return [items, activeItem, dispatch, click_handler];
    }

    class Tabs extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$7, safe_not_equal, { items: 0, activeItem: 1 });
    	}
    }

    /* src/App.svelte generated by Svelte v3.22.2 */

    function create_if_block_1(ctx) {
    	let current;
    	const createpollform = new CreatePollForm({});
    	createpollform.$on("add", /*handleAdd*/ ctx[3]);

    	return {
    		c() {
    			create_component(createpollform.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(createpollform, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(createpollform.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(createpollform.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(createpollform, detaching);
    		}
    	};
    }

    // (32:2) {#if activeItem === 'Current Polls'}
    function create_if_block(ctx) {
    	let current;
    	const polllist = new PollList({});

    	return {
    		c() {
    			create_component(polllist.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(polllist, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(polllist.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(polllist.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(polllist, detaching);
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let t0;
    	let main;
    	let t1;
    	let current_block_type_index;
    	let if_block;
    	let t2;
    	let current;
    	const header = new Header({});

    	const tabs = new Tabs({
    			props: {
    				activeItem: /*activeItem*/ ctx[0],
    				items: /*items*/ ctx[1]
    			}
    		});

    	tabs.$on("tabChange", /*tabChange*/ ctx[2]);
    	const if_block_creators = [create_if_block, create_if_block_1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*activeItem*/ ctx[0] === "Current Polls") return 0;
    		if (/*activeItem*/ ctx[0] === "Add New Poll") return 1;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	const footer = new Footer({});

    	return {
    		c() {
    			create_component(header.$$.fragment);
    			t0 = space();
    			main = element("main");
    			create_component(tabs.$$.fragment);
    			t1 = space();
    			if (if_block) if_block.c();
    			t2 = space();
    			create_component(footer.$$.fragment);
    			attr(main, "class", "svelte-3yykcz");
    		},
    		m(target, anchor) {
    			mount_component(header, target, anchor);
    			insert(target, t0, anchor);
    			insert(target, main, anchor);
    			mount_component(tabs, main, null);
    			append(main, t1);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(main, null);
    			}

    			insert(target, t2, anchor);
    			mount_component(footer, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const tabs_changes = {};
    			if (dirty & /*activeItem*/ 1) tabs_changes.activeItem = /*activeItem*/ ctx[0];
    			tabs.$set(tabs_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					}

    					transition_in(if_block, 1);
    					if_block.m(main, null);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(header.$$.fragment, local);
    			transition_in(tabs.$$.fragment, local);
    			transition_in(if_block);
    			transition_in(footer.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(header.$$.fragment, local);
    			transition_out(tabs.$$.fragment, local);
    			transition_out(if_block);
    			transition_out(footer.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(header, detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(main);
    			destroy_component(tabs);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}

    			if (detaching) detach(t2);
    			destroy_component(footer, detaching);
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let items = ["Current Polls", "Add New Poll"];
    	let activeItem = "Current Polls";

    	const tabChange = e => {
    		$$invalidate(0, activeItem = e.detail);
    	};

    	const handleAdd = e => {
    		$$invalidate(0, activeItem = "Current Polls");
    	};

    	return [activeItem, items, tabChange, handleAdd];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$8, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
