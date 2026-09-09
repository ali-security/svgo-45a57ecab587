'use strict';

exports.type = 'perItem';

exports.active = false;

exports.description = 'removes <script> elements (disabled by default)';

/**
 * Namespaces that support executable <script> elements.
 */
var SCRIPT_NAMESPACES = [
    'http://www.w3.org/2000/svg',
    'http://www.w3.org/1999/xhtml'
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
 * Remove <script>.
 *
 * Scripts are also removed when they are declared with an explicit namespace
 * prefix bound to a namespace that treats <script> as executable, i.e. the SVG
 * and XHTML namespaces. Prefixes bound to any other namespace are left alone,
 * as those elements aren't executable.
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

    return true;

};
