import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EditNameForm } from './EditNameForm'

describe('EditNameForm', () => {
  it('mevcut adı gösterir, düzenlenip gönderilince onSave güncel değerle çağrılır', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <EditNameForm
        currentName="Ayşe Yılmaz"
        pending={false}
        error={null}
        savedMessage={null}
        onSave={onSave}
      />,
    )

    const input = screen.getByLabelText('Görünen ad')
    expect(input).toHaveValue('Ayşe Yılmaz')

    await user.clear(input)
    await user.type(input, 'Yeni Ad')
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))

    expect(onSave).toHaveBeenCalledWith('Yeni Ad')
  })

  it('pending true iken Kaydet düğmesi devre dışıdır', () => {
    render(
      <EditNameForm currentName="Ayşe" pending error={null} savedMessage={null} onSave={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled()
  })

  it('sunucu INVALID_NAME döndüğünde hata role="alert" ile görünür', () => {
    render(
      <EditNameForm
        currentName="Ayşe"
        pending={false}
        error="INVALID_NAME"
        savedMessage={null}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Görünen ad 2 ile 40 karakter arasında olmalı.',
    )
  })

  it('kayıt başarılı olunca durum mesajı role="status" ile duyurulur', () => {
    render(
      <EditNameForm
        currentName="Ayşe"
        pending={false}
        error={null}
        savedMessage="Adın güncellendi."
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Adın güncellendi.')
  })
})
