'use strict';

// reverse, i.e. bottom-up: an <a> is collapsed from its parent, so its subtree
// has to be visited while the <a>, and the namespace prefixes it declares, are
// still part of the tree
exports.type = 'perItemReverse';

exports.active = false;

exports.description = 'removes <script> elements (disabled by default)';

var SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Namespaces that support SVG <foreignObject> elements.
 */
var FOREIGN_OBJECT_NAMESPACES = [SVG_NAMESPACE];

/**
 * Namespaces that support SVG <a> elements.
 */
var ANCHOR_NAMESPACES = [SVG_NAMESPACE];

/**
 * Namespaces that support executable <script> elements.
 */
var SCRIPT_NAMESPACES = [
    SVG_NAMESPACE,
    'http://www.w3.org/1999/xhtml'
];

/**
 * Attributes that can load or navigate to executable documents in HTML.
 */
var HTML_URL_ATTRS = ['action', 'data', 'formaction', 'href', 'src'];

/**
 * Media types of data: URIs that browsers treat as executable documents.
 */
var EXECUTABLE_DATA_MEDIA_TYPES = [
    'application/xhtml+xml',
    'image/svg+xml',
    'text/html'
];

/**
 * Resolve an XML namespace prefix to the namespace it's bound to, by looking up
 * the nearest xmlns:<prefix> declaration on the element itself or on one of its
 * ancestors, as XML namespace declarations are scoped to their subtree.
 *
 * @param {Object} item element to start the lookup at
 * @param {String} prefix XML namespace prefix
 * @return {String|Undefined} namespace the prefix is bound to, if any
 */
function resolveNamespace(item, prefix) {

    var name = 'xmlns:' + prefix,
        elem = item;

    while (elem) {
        if (elem.attrs && elem.attrs[name]) {
            return elem.attrs[name].value;
        }
        elem = elem.parentNode;
    }

    return undefined;

}

/**
 * Normalize a URL the way browsers do before its scheme is looked at: ASCII
 * tabs and newlines are stripped from anywhere in the URL, leading whitespace
 * and control characters are ignored, and the scheme is case-insensitive.
 *
 * @param {String} value URL to normalize
 * @return {String} normalized, lowercased URL
 */
function normalizeUrl(value) {

    var url = '',
        code,
        i;

    for (i = 0; i < value.length; i++) {
        code = value.charCodeAt(i);

        // tab, line feed and carriage return, anywhere in the URL
        if (code === 9 || code === 10 || code === 13) {
            continue;
        }

        // leading whitespace and C0 control characters
        if (!url.length && code <= 32) {
            continue;
        }

        url += value.charAt(i);
    }

    return url.toLowerCase();

}

/**
 * Determine whether a URL loads or navigates to an executable document, i.e. it
 * uses the javascript: or the legacy vbscript: scheme, or it's a data: URI with
 * a media type that browsers execute.
 *
 * @param {String} value attribute value
 * @return {Boolean} true if the URL points at an executable document
 */
function isExecutableUrl(value) {
    /* jshint scripturl: true */

    if (typeof value !== 'string') {
        return false;
    }

    var url = normalizeUrl(value),
        mediaTypeEnd;

    if (url.indexOf('javascript:') === 0 || url.indexOf('vbscript:') === 0) {
        return true;
    }

    if (url.indexOf('data:') !== 0) {
        return false;
    }

    // the media type of a data: URI ends at the first parameter or at the data
    mediaTypeEnd = url.slice(5).search(/[;,]/);

    if (mediaTypeEnd === -1) {
        return false;
    }

    return EXECUTABLE_DATA_MEDIA_TYPES.indexOf(url.slice(5, mediaTypeEnd + 5).trim()) !== -1;

}

/**
 * Determine whether the element is an SVG <foreignObject>, i.e. either the bare
 * element name, which lives in the default (SVG) namespace, or a prefixed name
 * whose prefix is bound to the SVG namespace. A local name of foreignObject in
 * an unrelated namespace doesn't embed HTML, so it isn't one.
 *
 * @param {Object} item element to test
 * @return {Boolean} true if the element is an SVG <foreignObject>
 */
function isForeignObject(item) {

    if (item.isElem('foreignObject')) {
        return true;
    }

    if (item.prefix && item.local === 'foreignObject' &&
        FOREIGN_OBJECT_NAMESPACES.indexOf(resolveNamespace(item, item.prefix)) !== -1) {
        return true;
    }

    return false;

}

/**
 * Determine whether the element is, or is a descendant of, an SVG
 * <foreignObject>, i.e. whether its attributes are interpreted as HTML.
 *
 * Upstream tracks this with a counter incremented when a <foreignObject> is
 * entered and decremented when it's left; the perItem plugin API has no exit
 * hook, so walk up from the element instead. The element itself is included,
 * matching upstream, where the counter is incremented before the element's own
 * attributes are inspected, and, as XML namespace declarations are scoped to
 * their subtree, this ancestor-or-self walk resolves prefixes exactly like the
 * upstream prefix stack does.
 *
 * @param {Object} item element to start the lookup at
 * @return {Boolean} true if the element is, or is inside, an SVG <foreignObject>
 */
function isInForeignObject(item) {

    var elem = item;

    while (elem) {
        if (elem.isElem && isForeignObject(elem)) {
            return true;
        }
        elem = elem.parentNode;
    }

    return false;

}

/**
 * Determine whether the element is an SVG <a>, i.e. either the bare element
 * name, which lives in the default (SVG) namespace, or a prefixed name whose
 * prefix is bound to the SVG namespace. A local name of a in an unrelated
 * namespace isn't a link a browser navigates to, so it isn't one.
 *
 * @param {Object} item element to test
 * @return {Boolean} true if the element is an SVG <a>
 */
function isAnchor(item) {

    if (item.isElem('a')) {
        return true;
    }

    if (item.prefix && item.local === 'a' &&
        ANCHOR_NAMESPACES.indexOf(resolveNamespace(item, item.prefix)) !== -1) {
        return true;
    }

    return false;

}

/**
 * Determine whether the element links to an executable document, i.e. it has an
 * href attribute, either unprefixed or in any namespace, whose URL loads or
 * navigates to one.
 *
 * @param {Object} item element to test
 * @return {Boolean} true if the element has an executable link
 */
function hasExecutableLink(item) {

    return item.someAttr(function(attr) {
        return (attr.name === 'href' || attr.name.slice(-5) === ':href') &&
            isExecutableUrl(attr.value);
    });

}

/**
 * Collapse the executable links among the element's children, moving the
 * content they wrap up into the element itself.
 *
 * Upstream collapses an anchor when it leaves it. Filtering the anchor out via a
 * false return value would drop the whole subtree instead of collapsing it, and
 * splicing the parent's content while it's being filtered would skip or lose
 * siblings, so the anchors are collapsed from their parent instead, the way
 * collapseGroups collapses groups. Together with the plugin's reverse traversal
 * that puts the collapse after the anchor's subtree has been sanitized, as
 * upstream's exit hook does.
 *
 * @param {Object} item element whose children to collapse
 */
function collapseExecutableLinks(item) {

    var child,
        i;

    for (i = 0; i < item.content.length; i++) {

        child = item.content[i];

        if (isAnchor(child) && hasExecutableLink(child)) {
            item.spliceContent(i, 1, child.content || []);

            // the collapsed content took the anchor's place, so look at this
            // position again, both to collapse an anchor nested directly in the
            // anchor and to keep the loop on the shifted siblings
            i--;
        }

    }

}

/**
 * Remove <script>, collapse executable links, and sanitize executable HTML
 * inside <foreignObject>.
 *
 * Scripts are also removed when they are declared with an explicit namespace
 * prefix bound to a namespace that treats <script> as executable, i.e. the SVG
 * and XHTML namespaces. Prefixes bound to any other namespace are left alone,
 * as those elements aren't executable.
 *
 * An <a> whose href, in any namespace, uses the javascript: or the legacy
 * vbscript: scheme, or points at a data: URI with an executable media type,
 * runs script on activation, so it's collapsed: the element is dropped and the
 * content it wraps is moved up into its parent. As with <script>, only anchors
 * in the SVG namespace are collapsed, and anchors with an inert link are kept
 * intact, as they only navigate.
 *
 * A <foreignObject> embeds HTML, which carries its own ways of executing
 * scripts, so inside one every event attribute, every srcdoc attribute and
 * every HTML URL attribute pointing at an executable document is dropped. The
 * elements and the rest of their attributes are preserved, as they are only
 * visual content.
 *
 * https://www.w3.org/TR/SVG/script.html
 *
 * @param {Object} item current iteration item
 * @return {Boolean} if false, item will be filtered out
 *
 * @author Patrick Klingemann
 */
exports.fn = function(item) {

    if (item.isElem('script')) {
        return false;
    }

    if (item.prefix && item.local === 'script' &&
        SCRIPT_NAMESPACES.indexOf(resolveNamespace(item, item.prefix)) !== -1) {
        return false;
    }

    if (item.isElem() && item.attrs && isInForeignObject(item)) {

        var attrs = item.attrs;

        Object.keys(attrs).forEach(function(name) {

            var local = name.slice(name.lastIndexOf(':') + 1).toLowerCase();

            if (local.indexOf('on') === 0 ||
                local === 'srcdoc' ||
                (HTML_URL_ATTRS.indexOf(local) !== -1 && isExecutableUrl(attrs[name].value))
            ) {
                item.removeAttr(name);
            }

        });

    }

    if (item.isElem() && !item.isEmpty()) {
        collapseExecutableLinks(item);
    }

    return true;

};
