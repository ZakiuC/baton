'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  History,
  Info,
  Layers,
  Tag,
} from 'lucide-react';
import {
  APP_DESCRIPTION,
  APP_FEATURES,
  APP_STACK,
  APP_TAGLINE,
  CHANGE_GROUP_LABELS,
  CHANGELOG,
} from '@/lib/version';
import { useAppVersion } from '@/lib/use-app-version';

export default function AboutPage() {
  const version = useAppVersion();

  return (
    <div className="p-5 max-w-[820px] mx-auto space-y-5 animate-fade-in">
      {/* 头部 */}
      <div className="flex items-center gap-3">
        <Link href="/settings" className="icon-button" aria-label="返回设置">
          <ArrowLeft size={15} aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-primary">关于</h1>
          <p className="text-xs text-muted mt-0.5">软件说明与版本更新记录</p>
        </div>
      </div>

      {/* 概要 */}
      <section className="card p-5" aria-labelledby="about-title">
        <div className="flex items-start gap-4">
          {/* 「关于」页展示的就是应用图标本身，而不是图标库里的近似字形。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.svg"
            alt=""
            width={44}
            height={44}
            className="w-11 h-11 rounded-xl flex-shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 id="about-title" className="text-base font-semibold text-primary tracking-tight">
              ProjectTracker
            </h2>
            <p className="text-xs text-muted mt-0.5">{APP_TAGLINE}</p>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <span className="badge text-accent bg-accent-subtle">
                <Tag size={10} aria-hidden="true" />
                v{version}
              </span>
              <span className="badge text-muted bg-muted-subtle">
                <BadgeCheck size={10} aria-hidden="true" />
                本地运行 · 不联网
              </span>
            </div>
          </div>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">{APP_DESCRIPTION}</p>
      </section>

      {/* 主要功能 */}
      <section className="card overflow-hidden" aria-labelledby="about-features">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-accent-subtler flex items-center justify-center flex-shrink-0">
            <Layers size={14} className="text-accent" aria-hidden="true" />
          </div>
          <h2 id="about-features" className="text-sm font-semibold text-primary">主要功能</h2>
        </div>
        <dl className="p-4 grid gap-3 sm:grid-cols-2">
          {APP_FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-lg border border-border bg-bg-subtler p-3">
              <dt className="text-xs font-semibold text-primary">{feature.title}</dt>
              <dd className="text-[11px] leading-relaxed text-muted mt-1">{feature.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 技术信息 */}
      <section className="card overflow-hidden" aria-labelledby="about-stack">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-accent-subtler flex items-center justify-center flex-shrink-0">
            <Info size={14} className="text-accent" aria-hidden="true" />
          </div>
          <h2 id="about-stack" className="text-sm font-semibold text-primary">运行信息</h2>
        </div>
        <dl className="p-4 space-y-2.5">
          {APP_STACK.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <dt className="text-[11px] font-medium text-muted sm:w-24 sm:flex-shrink-0">{row.label}</dt>
              <dd className="text-xs text-primary break-all">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 更新记录 */}
      <section className="card overflow-hidden" aria-labelledby="about-changelog">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-accent-subtler flex items-center justify-center flex-shrink-0">
            <History size={14} className="text-accent" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="about-changelog" className="text-sm font-semibold text-primary">更新记录</h2>
            <p className="text-xs text-muted mt-0.5">
              版本号遵循语义化版本（SemVer）：新功能升次版本，问题修复升修订号。
              完整规则见仓库内 <code className="font-mono text-[11px]">docs/CONVENTIONS.md</code>。
            </p>
          </div>
          <span className="badge text-muted bg-muted-subtle">{CHANGELOG.length} 个版本</span>
        </div>

        <div className="p-4">
          {CHANGELOG.map((entry, index) => (
            <article
              key={entry.version}
              className={index === 0 ? '' : 'mt-5 pt-5 border-t border-border'}
              aria-label={`版本 ${entry.version}`}
            >
              <header className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-primary font-mono">v{entry.version}</h3>
                {index === 0 ? (
                  <span className="badge text-accent bg-accent-subtle">当前版本</span>
                ) : null}
                {entry.released ? (
                  <span className="text-[11px] text-muted">{entry.released}</span>
                ) : (
                  <span className="badge text-warning bg-warning-subtle">开发中</span>
                )}
              </header>
              <p className="text-xs text-muted mt-1.5 leading-relaxed">{entry.summary}</p>

              <div className="mt-3 space-y-3">
                {entry.groups.map((group) => (
                  <div key={group.kind}>
                    <p className="text-[11px] font-semibold text-accent mb-1">
                      {CHANGE_GROUP_LABELS[group.kind]}
                    </p>
                    <ul className="space-y-1">
                      {group.items.map((item) => (
                        <li key={item} className="flex gap-2 text-[11px] leading-relaxed text-muted">
                          <span className="mt-[6px] w-1 h-1 rounded-full bg-muted flex-shrink-0" aria-hidden="true" />
                          <span className="min-w-0">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
