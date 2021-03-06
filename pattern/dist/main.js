(function (exports) {
'use strict';

// Subscribers are instances of Mediator Channel registrations. We generate
// an object instance so that it can be updated later on without having to
// unregister and re-register. Subscribers are constructed with a function
// to be called, options object, and context.

class Subscriber {
    constructor(fn, options, context = {}, channel = null) {
        this.fn = fn;
        this.channel = channel;
        this.context = context;
        this.options = options;
    };

    // Mediator.update on a subscriber instance can update its function,context,
    // or options object. It takes in an object and looks for fn, context, or
    // options keys.
    update(options = {}) {
        Object.assign(this, options);
        if (this.channel) {
            this.setPriority(this.priority);
        }
    };

    set options(options) {
        this.update(options);
    };

    set context(context) {
        this.setHook(context);
        this._context = context;
    };

    get context() {
        return this._context;
    };

    setHook(context) {
        let channel = this.channel;
        if (channel) {
            channel.hook(this, context);
        }
    }

    _reduceCalls() {
        // Check if the subscriber has options and if this include the calls options
        if (this.calls !== undefined) {
            // Decrease the number of calls left by one
            this.calls--;
            // Once the number of calls left reaches zero or less we need to remove the subscriber
            if (this.calls < 1) {
                this.remove();
            }
        }
    };

    //return event remove method
    remove() {
        let channel = this.channel;
        if (channel) {
            channel.removeSubscriber(this);
        }
    };

    //Dynamic setPriority method
    setPriority(priority) {
        let channel = this.channel;
        if (channel) {
            channel.setPriority(this, priority);
        }
    };

    run(data) {
        if (!this.channel.stopped
            && !(typeof this.predicate === "function"
            && !this.predicate.apply(this.context, data))) {
            // Check if the callback should be called
            this._reduceCalls();
            //Execute function.
            this.fn.apply(this.context, data);
        }
    };

}

class Channel {
    constructor(namespace, parent, context, hook) {
        this.namespace = namespace || "";
        this._subscribers = [];
        this._channels = new Map();
        this._parent = parent;
        this.stopped = false;
        this.context = context;
        this.hook = hook;
    };


    // A Mediator channel holds a list of sub-channels and subscribers to be fired
    // when Mediator.publish is called on the Mediator instance. It also contains
    // some methods to manipulate its lists of data; only setPriority and
    // StopPropagation are meant to be used. The other methods should be accessed
    // through the Mediator instance.

    addSubscriber(fn, options, context = this.context) {
        return new Subscriber(fn, options, context, this);
    };


    // The channel instance is passed as an argument to the mediator subscriber,
    // and further subscriber propagation can be called with
    // channel.StopPropagation().
    stopPropagation() {
        this.stopped = true;
    };

    // Channel.setPriority is useful in updating the order in which Subscribers
    // are called, and takes an identifier (subscriber id or named function) and
    // an array index. It will not search recursively through subchannels.

    setPriority(subscriber, priority) {
        let subscribers = this._subscribers,
            index = subscribers.indexOf(subscriber);

        if (index !== -1) {
            subscribers.splice(subscribers.indexOf(subscriber), 1);
        }

        if (priority !== undefined && priority < this._subscribers.length) {
            subscribers.splice(priority, 0, subscriber);
        } else {
            subscribers.push(subscriber);
        }
    };

    hasChannel(channel) {
        return this._channels.has(channel);
    };

    getChannel(channel) {
        return this._channels.get(channel);
    };

    setChannel(namespace, readOnly) {
        if (!this.hasChannel(namespace) && !readOnly) {
            let channel = new Channel((this.namespace ? this.namespace + ':' : '') + namespace, this, this.context, this.hook);
            this._channels.set(namespace, channel);
            return channel;
        } else {
            return this.getChannel(namespace)
        }
    };

    returnChannel(channels, readOnly) {
        if (channels && channels.length > 0) {
            let channel = channels.shift(),
                returnChannel = this.setChannel(channel, readOnly);
            if (returnChannel && channels.length > 0) {
                return returnChannel.returnChannel(channels, readOnly);
            } else {
                return returnChannel;
            }
        }
    };


    removeSubscriber(subscriber) {
        let subscribers = this._subscribers,
            index = subscribers.indexOf(subscriber);
        // If we don't pass in an value, we're clearing all
        if (!subscriber) {
            subscribers.splice(0, subscribers.length);
        } else if (index !== -1) {
            subscribers.splice(index, 1);
        }

        if (this._subscribers.length === 0 && this._parent) {
            this._parent.removeChannel(this);
        }
    };

    removeChannel(channel) {
        if (channel === this.getChannel(channel.namespace)) {
            this._channels.delete(channel.namespace);
        }
    };

    clear() {
        this._channels.forEach(channel => channel.clear());
        this.removeSubscriber();
    };

    // This will publish arbitrary arguments to a subscriber and then to parent
    // channels.

    publish(data) {
        //slice method are cloning array, means default array can remove handlers
        this._subscribers.slice().forEach(subscriber => subscriber.run(data));

        if (this._parent) {
            this._parent.publish(data);
        }

        this.stopped = false;
    };
}

class Mediator {
    constructor(context = {}, hook = () => {
    }) {
        if (!(this instanceof Mediator)) {
            return new Mediator(context, hook);
        }
        this.channel = new Channel('', false, context, hook);
    }

    // A Mediator instance is the interface through which events are registered
    // and removed from publish channels.


    // Returns a channel instance based on namespace, for example
    // application:chat:message:received. If readOnly is true we
    // will refrain from creating non existing channels.

    getChannel(namespace, readOnly) {
        let namespaceHierarchy = namespace.split(':');
        if (namespaceHierarchy.length > 0) {
            return this.channel.returnChannel(namespaceHierarchy, readOnly);
        }
    };

    // Pass in a channel namespace, function to be called, options, and context
    // to call the function in to Subscribe. It will create a channel if one
    // does not exist. Options can include a predicate to determine if it
    // should be called (based on the data published to it) and a priority
    // index.

    subscribe(channelName, fn, options = {}, context) {
        if (channelName && channelName !== '') {
            let channel = this.getChannel(channelName, false);
            return channel.addSubscriber(fn, options, context);
        } else {
            throw Error('Namespace should be provided!');
        }
    };

    // Pass in a channel namespace, function to be called, options, and context
    // to call the function in to Subscribe. It will create a channel if one
    // does not exist. Options can include a predicate to determine if it
    // should be called (based on the data published to it) and a priority
    // index.

    once(channelName, fn, options = {}, context) {
        options.calls = 1;
        return this.subscribe(channelName, fn, options, context);
    };

    // Publishes arbitrary data to a given channel namespace. Channels are
    // called recursively downwards; a post to application:chat will post to
    // application:chat:receive and application:chat:derp:test:beta:bananas.
    // Called using Mediator.publish("application:chat", [ args ]);

    publish(channelName, ...args) {
        if (channelName && channelName !== '') {
            let channel = this.getChannel(channelName, true);
            if (channel && channel.namespace === channelName) {
                args.push(channel);
                channel.publish(args);
            }
        }
    };

    clear() {
        this.channel.clear();
    };
}

// Alias some common names for easy interop
Mediator.prototype.on = Mediator.prototype.subscribe;
Mediator.prototype.trigger = Mediator.prototype.publish;

// Finally, expose it all.

Mediator.version = "0.9.9";

let on = (el, ev, cb, context, ...args) => {
        let events = ev.split(' '),
            fn = (e) => {
                cb.apply(context || undefined, [e].concat(args));
            };

        events.forEach((event) => {
            el.addEventListener(event, fn);
        });
        return {
            remove: () => {
                events.forEach(event => el.removeEventListener(event, fn));
            }
        }
    };
let addTemplate = (container, template) => {
        return new Promise((res, rej) => {
            container.innerHTML = template;
            res(container);
        });
    };
let select = (selector, cb) => (el) => cb(el.querySelector(selector));
let selectAll = (selector, cb) => (el) => cb(el.querySelectorAll(selector));

class Container {
    constructor(el) {
        this.el = el;
        this._handlers = [];
    };

    on(ev, cb) {
        let evt = on(this.el, ev, cb, this);
        this._handlers.push(evt);
    };

    addTemplate(template) {
        return addTemplate(this.el, template).then(container => this);
    };

    remove() {
        let parent = this.el.parentNode;
        this._handlers.forEach(hd => hd.remove());
        parent.removeChild(this.el);
    }
}


let DOM = {
    on,
    Container,
    select,
    selectAll,
    container: (selector) => new Container(document.querySelector(selector))
};

let waitUntilInstalled = (registration) => new Promise((resolve, reject) => {
    let {installing} = registration;
    if (installing) {
        installing.addEventListener('statechange', (e) => {
            if (e.target.state == 'activated') {
                resolve();
            } else if (e.target.state == 'redundant') {
                reject();
            }
        });
    } else {
        resolve();
    }
});

let swRun = (opt ={scope: './'}) => new Promise((res, rej) => {
    if ('serviceWorker' in navigator) {
        (async () => {
            let registration = await navigator.serviceWorker.register('./service-worker.js', opt);
            await waitUntilInstalled(registration);
            res();
        })();
    } else {
        // The current browser doesn't support service workers.
        rej('Service Worker not available!');
    }
});

exports.DOM = DOM;
exports.Mediator = Mediator;
exports.swRun = swRun;

}((this.utils = this.utils || {})));
