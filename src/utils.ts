export const W = 'w'
export const A = 'a'
export const S = 's'
export const D = 'd'
export const SHIFT = 'shift'
export const DIRECTIONS = [W, A, S, D]

export class KeyDisplay {

    map: Map<string, HTMLDivElement> = new Map()

    constructor() {
        this.createButton(W, 'buttons/w.png', 80, 80)
        this.createButton(A, 'buttons/a.png', 80, 80)
        this.createButton(S, 'buttons/s.png', 80, 80)
        this.createButton(D, 'buttons/d.png', 80, 80)
        this.createButton(SHIFT, 'buttons/shift.png', 130, 60) // Larger shift

        this.updatePosition()

        this.map.forEach( (v, _) => {
            document.body.append(v)
        })
    }

    private createButton(key: string, imgPath: string, width: number, height: number) {
        const div = document.createElement("div")
        div.style.position = 'absolute'
        div.style.width = `${width}px`
        div.style.height = `${height}px`
        div.style.backgroundImage = `url(${imgPath})`
        div.style.backgroundSize = '100% 100%' // Ensure full fit
        div.style.backgroundRepeat = 'no-repeat'
        div.style.cursor = 'pointer'
        div.style.transition = 'transform 0.1s'
        div.style.userSelect = 'none'

        // Click support
        div.addEventListener('mousedown', () => {
            const eventDown = new KeyboardEvent('keydown', { key: key })
            document.dispatchEvent(eventDown)
        })
        div.addEventListener('mouseup', () => {
            const eventUp = new KeyboardEvent('keyup', { key: key })
            document.dispatchEvent(eventUp)
        })
        // Touch support
        div.addEventListener('touchstart', (e) => {
            e.preventDefault()
            const eventDown = new KeyboardEvent('keydown', { key: key })
            document.dispatchEvent(eventDown)
        })
        div.addEventListener('touchend', (e) => {
            e.preventDefault()
            const eventUp = new KeyboardEvent('keyup', { key: key })
            document.dispatchEvent(eventUp)
        })

        this.map.set(key, div)
    }

    public updatePosition() {
        const bottomOffset = 150
        const leftOffset = 200
        const spacing = 85

        // W is top center
        this.map.get(W).style.top = `${window.innerHeight - bottomOffset - spacing}px`
        this.map.get(W).style.left = `${leftOffset + spacing}px`

        // A, S, D are bottom row
        this.map.get(A).style.top = `${window.innerHeight - bottomOffset}px`
        this.map.get(A).style.left = `${leftOffset}px`

        this.map.get(S).style.top = `${window.innerHeight - bottomOffset}px`
        this.map.get(S).style.left = `${leftOffset + spacing}px`

        this.map.get(D).style.top = `${window.innerHeight - bottomOffset}px`
        this.map.get(D).style.left = `${leftOffset + (spacing * 2)}px`

        // Shift is to the left, vertically aligned with the bottom row
        this.map.get(SHIFT).style.top = `${window.innerHeight - bottomOffset + 10}px` // +10 to center vertically with larger WASD
        this.map.get(SHIFT).style.left = `${leftOffset - 150}px`
    }

    public down (key: string) {
        const btn = this.map.get(key.toLowerCase())
        if (btn) {
            btn.style.transform = 'scale(0.9)'
            btn.style.filter = 'brightness(0.7)'
        }
    }

    public up (key: string) {
        const btn = this.map.get(key.toLowerCase())
        if (btn) {
            btn.style.transform = 'scale(1.0)'
            btn.style.filter = 'brightness(1.0)'
        }
    }
}