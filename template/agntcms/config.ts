// USER ZONE — section + global registry for this project.

import { defineConfig } from '@agntcms/next/config'

import { Hero } from './sections/Hero'
import { LogoStrip } from './sections/LogoStrip'
import { TabbedFeatures } from './sections/TabbedFeatures'
import { FeatureGrid } from './sections/FeatureGrid'
import { ImageText } from './sections/ImageText'
import { Newsletter } from './sections/Newsletter'
import { FeaturedArticles } from './sections/FeaturedArticles'
import { Banner } from './sections/Banner'
import { Testimonials } from './sections/Testimonials'
import { CaseStudies } from './sections/CaseStudies'
import { TeamGrid } from './sections/TeamGrid'
import { PricingPlans } from './sections/PricingPlans'
import { FAQ } from './sections/FAQ'
import { ContactForm } from './sections/ContactForm'
import { BlogIndexHeader } from './sections/BlogIndexHeader'
import { ArticleHero } from './sections/ArticleHero'
import { ArticleBody } from './sections/ArticleBody'
import { SiteHeader } from './sections/SiteHeader'
import { SiteFooter } from './sections/SiteFooter'
import { SiteMeta } from './sections/SiteMeta'

export default defineConfig({
  sections: [
    Hero,
    LogoStrip,
    TabbedFeatures,
    FeatureGrid,
    ImageText,
    Newsletter,
    FeaturedArticles,
    Banner,
    Testimonials,
    CaseStudies,
    TeamGrid,
    PricingPlans,
    FAQ,
    ContactForm,
    BlogIndexHeader,
    ArticleHero,
    ArticleBody,
    SiteHeader,
    SiteFooter,
    SiteMeta,
  ],
})
