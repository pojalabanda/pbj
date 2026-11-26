---
title: Vremenska napoved
year: 2026
eleventyExcludeFromCollections: true
---
{% assign lastForecast = collections[route] | last %}
{% assign image = lastForecast.url %}

{% include 'weather-nav', route: '2026_a1' %}

## Scenarij A: do Ilovika in nazaj
### Vrsar - Ilovik: sreda, 2.12. ob 21h
{% include 'weather-route', route: '2026_a1' %}

### Ilovik - Pula: petek, 4.12. ob 9h
{% include 'weather-route', route: '2026_a2' %}

### Pula - Vrsar: sobota, 5.12. ob 9h
{% include 'weather-route', route: '2026_a3' %}

Povezava na stran za <a href="/vreme/" class="no-underline border-b-2 border-link hover:bg-link-hover">vreme in napovedi</a>.
