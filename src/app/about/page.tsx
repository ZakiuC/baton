'use client';

import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Tag } from 'lucide-react';
import {
  APP_DESCRIPTION,
  APP_FEATURES,
  APP_NAME_FULL,
  APP_STACK,
  APP_TAGLINE,
  CHANGE_GROUP_LABELS,
  CHANGELOG,
} from '@/lib/version';
import { useAppVersion } from '@/lib/use-app-version';

export default function AboutPage() {
  const version = useAppVersion();

  return (
    <div className="about-page animate-fade-in">
      <div className="page-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/settings" className="icon-button" aria-label="返回设置">
            <ArrowLeft size={15} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="page-title" style={{ fontSize: 17 }}>关于</h1>
            <p className="page-sub">软件说明与版本更新记录</p>
          </div>
        </div>
        <span className="micro-mono">本机 · v{version}</span>
      </div>

      <div className="stack">
        <section className="panel" aria-labelledby="about-title-section">
          <div className="panel-head">
            <span className="panel-mark" aria-hidden="true" />
            <h2 id="about-title-section" className="panel-title">设备铭牌</h2>
            <span className="panel-index">不联网 · 不上传</span>
          </div>
          <div style={{ padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={40} height={40} style={{ borderRadius: 5, flexShrink: 0 }} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <h2 id="about-title" style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{APP_NAME_FULL}</h2>
              <p className="micro" style={{ margin: '2px 0 0' }}>{APP_TAGLINE}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <span className="badge" style={{ color: 'var(--t-accent)', background: 'var(--t-accent-subtle)' }}>
                  <Tag size={10} aria-hidden="true" />
                  v{version}
                </span>
                <span className="badge badge--outline">
                  <BadgeCheck size={10} aria-hidden="true" />
                  本地运行 · 不联网
                </span>
              </div>
            </div>
          </div>
          <p style={{ margin: 0, padding: '0 14px 14px', fontSize: 13, lineHeight: 1.7, color: 'var(--t-muted)', maxWidth: '72ch' }}>
            {APP_DESCRIPTION}
          </p>
        </section>

        <section className="panel" id="about-features" aria-labelledby="about-features-title">
          <div className="panel-head">
            <span className="panel-mark" aria-hidden="true" />
            <h2 id="about-features-title" className="panel-title">主要功能</h2>
            <span className="panel-index">{APP_FEATURES.length} 项</span>
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, padding: 12, margin: 0 }}>
            {APP_FEATURES.map((feature) => (
              <div key={feature.title} className="about-feature">
                <dt>{feature.title}</dt>
                <dd>{feature.detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel" id="about-stack" aria-labelledby="about-stack-title">
          <div className="panel-head">
            <span className="panel-mark" aria-hidden="true" />
            <h2 id="about-stack-title" className="panel-title">运行信息</h2>
            <span className="panel-index">本机</span>
          </div>
          <dl className="kv" style={{ padding: 14 }}>
            {APP_STACK.map((item) => (
              <div key={item.label} style={{ display: 'contents' }}>
                <dt>{item.label}</dt>
                <dd style={{ fontFamily: item.label === '数据位置' ? 'var(--font-code)' : undefined }}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel" aria-labelledby="about-changelog">
          <div className="panel-head">
            <span className="panel-mark" aria-hidden="true" />
            <h2 id="about-changelog" className="panel-title">更新记录</h2>
            <span className="badge badge--outline" style={{ marginLeft: 'auto' }}>{CHANGELOG.length} 个版本</span>
          </div>
          <div style={{ padding: '14px 14px 6px' }}>
            {CHANGELOG.map((entry, index) => (
              <article key={entry.version} className="changelog-item" aria-label={`版本 ${entry.version}`}>
                <div className="changelog-rail">
                  <h3 className="changelog-version" style={{ margin: 0 }}>v{entry.version}</h3>
                  {entry.released ? <div className="micro-mono" style={{ marginTop: 2 }}>{entry.released}</div> : <span className="badge" style={{ marginTop: 3, color: 'var(--t-warning)', background: 'var(--t-warning-subtle)' }}>开发中</span>}
                  {index === 0 ? <div className="badge" style={{ marginTop: 4, color: 'var(--t-accent)', background: 'var(--t-accent-subtle)' }}>当前</div> : null}
                </div>
                <div className="changelog-body">
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--t-primary)' }}>{entry.summary}</p>
                  <div style={{ marginTop: 7 }}>
                    {entry.groups.map((group) => (
                      <div key={group.kind} style={{ marginTop: 6 }}>
                        <p className="micro-mono" style={{ color: 'var(--t-accent)', margin: 0 }}>{CHANGE_GROUP_LABELS[group.kind]}</p>
                        <ul className="changelog-list">
                          {group.items.map((item) => (
                            <li key={item}><span style={{ minWidth: 0 }}>{item}</span></li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
