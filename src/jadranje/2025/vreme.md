---
title: Vremenska napoved
year: 2025
eleventyExcludeFromCollections: true
---
{% assign lastForecast = collections[route] | last %}
{% assign image = lastForecast.url %}

{% include 'weather-nav', route: '2025_a1' %}

## Scenarij A: do Cresa in nazaj
### Vrsar - Porer - Cres: sreda, 3.12. ob 21h
{% include 'weather-route', route: '2025_a1' %}

### Cres - Fenoliga - Pula: petek, 4.12. ob 8h
{% include 'weather-route', route: '2025_a2' %}

### Pula - Vrsar: sobota, 7.12. ob 8h
{% include 'weather-route', route: '2025_a3' %}

Povezava na stran za <a href="/vreme/" class="no-underline border-b-2 border-link hover:bg-link-hover">vreme in napovedi</a>.