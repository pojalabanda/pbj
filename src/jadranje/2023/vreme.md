---
title: Vremenska napoved
year: 2023
eleventyExcludeFromCollections: true
---
{% assign lastForecast = collections[route] | last %}
{% assign image = lastForecast.url %}

{% include 'weather-nav', route: '2023_a1' %}

## Scenarij 1: čez Kvarner
### Vrsar - Ilovik: sreda, 6.12. ob 21h
{% include 'weather-route', route: '2023_a1' %}

### Ilovik - Pula: petek, 8.12. ob 9h
{% include 'weather-route', route: '2023_a2' %}

### Pula - Vrsar: sobota, 9.12. ob 9h
{% include 'weather-route', route: '2023_a3' %}

## Scenarij 2: ob Istri
_Se bo v primeru neprimernega vremena določil kasneje..._

Povezava na stran za <a href="/vreme/" class="no-underline border-b-2 border-link hover:bg-link-hover">vreme in napovedi</a>.
