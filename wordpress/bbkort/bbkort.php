<?php
/**
 * Plugin Name: BBKORT – King of the Court
 * Description: Osadza aplikację BBKORT (mapa boisk, drużyny, wyzwania) na stronie WordPress. Użycie: shortcode [bbkort]
 * Version: 1.0.0
 * Author: BBKORT
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) exit;

/**
 * [bbkort]                       – aplikacja na całą wysokość ekranu
 * [bbkort height="700px"]        – własna wysokość
 * [bbkort view="teams"]          – start na wybranej zakładce (map | teams | matches)
 */
function bbkort_shortcode($atts) {
    $a = shortcode_atts(array(
        'height' => 'calc(100vh - 80px)',
        'view'   => 'map',
    ), $atts, 'bbkort');

    $src = plugins_url('app/index.html', __FILE__) . '#/' . rawurlencode($a['view']);

    return sprintf(
        '<div class="bbkort-wrap" style="position:relative;width:100%%;height:%1$s;min-height:560px;border-radius:14px;overflow:hidden;background:#0d0f14">
           <iframe src="%2$s" title="BBKORT" allow="geolocation; fullscreen" loading="lazy"
                   style="position:absolute;inset:0;width:100%%;height:100%%;border:0"></iframe>
         </div>
         <p style="text-align:right;font-size:13px;margin:6px 0 0"><a href="%3$s" target="_blank" rel="noopener">Otwórz BBKORT na pełnym ekranie ↗</a></p>',
        esc_attr($a['height']),
        esc_url($src),
        esc_url(plugins_url('app/index.html', __FILE__))
    );
}
add_shortcode('bbkort', 'bbkort_shortcode');
