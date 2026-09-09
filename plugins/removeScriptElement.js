'use strict';

exports.type = 'perItem';

exports.active = false;

exports.description = 'removes <script> elements (disabled by default)';

var SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Namespaces that support SVG <foreignObject> elements.
 */
var FOREIGN_OBJECT_NAMESPACES = [SVG_NAMESPACE];

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
 * Remove <script>, and sanitize executable HTML inside <foreignObject>.
 *
 * Scripts are also removed when they are declared with an explicit namespace
 * prefix bound to a namespace that treats <script> as executable, i.e. the SVG
 * and XHTML namespaces. Prefixes bound to any other namespace are left alone,
 * as those elements aren't executable.
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

    return true;

};
