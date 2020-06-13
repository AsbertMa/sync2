import { boot } from 'quasar/wrappers'
import * as State from 'src/state'
import AuthenticationDialog from 'pages/AuthenticationDialog.vue'
import { Storage } from 'core/storage'
import { QSpinnerIos } from 'quasar'
import type { Entry } from 'vue-router-stack'
import AsyncComputed from 'vue-async-computed'
import { toChecksumAddress } from 'thor-devkit/dist/cry/address'
import { BigNumber } from 'bignumber.js'

declare global {
    type AuthenticateOptions = {
        /** customized title text */
        title?: string
    }
}

declare module 'vue/types/vue' {
    interface Vue {
        $state: ReturnType<typeof State.build>

        $storage: Storage

        /**
         * pop up the authentication dialog to ask user entering password,
         * then run the given task and return the result
         * @param task a task which requires the password to finish
         * @param options
         */
        $authenticate<T>(
            task: (password: string) => Promise<T>,
            options?: AuthenticateOptions
        ): Promise<T>

        /**
         * protected the async task with a loading mask
         * @param task the async task
         * @returns the result of the task
         */
        $loading<T>(task: () => Promise<T>): Promise<T>

        /** the route object which leads to render this component by StackedRouterView.
         * unlike $route, $stackedRoute is permanently bound to a component instance.
         */
        $stackedRoute: Entry | null
    }
}

// define filters
const filters = {
    /** convert genesis id to network name */
    net: (gid: string) => {
        if (gid === '0x00000000851caf3cfdb6e899cf5958bfb1ac3413d346d43539627e6be7ec1b4a') {
            return 'main net'
        } else if (gid === '0x000000000b2bce3c70bc649a02749e8687721b09ed2e15997f466536b20bb127') {
            return 'test net'
        }
        return 'private net'
    },
    /**
     * convert s into abbreviation, where l1 l2 specifies length of head and tail
     */
    abbrev: (s: string, l1 = 6, l2 = 4) => {
        if (s.length <= l1 + l2) {
            return s
        }
        return s.slice(0, l1) + '⋯' + s.slice(-l2)
    },
    /** convert the address into checksum format */
    checksum: (addr: string) => {
        return toChecksumAddress(addr)
    },
    /** convert balance from unit WEI to common unit */
    balance: (v: string | number, decimal = 18, digits = 2) => {
        if (typeof v !== 'string' && typeof typeof v !== 'number') {
            return new BigNumber(0).toFormat(digits).replace(/0/g, '-')
        }
        return new BigNumber(v)
            .div(new BigNumber('1' + '0'.repeat(decimal)))
            .toFormat(digits)
    }
}

export default boot(async ({ Vue }) => {
    // install filters here
    Object.entries(filters).forEach(([name, fn]) => {
        Vue.filter(name, fn)
    })

    const state = State.build()
    const storage = await Storage.init()
    let loadingCount = 0

    const delayedSpinner = Vue.component('DelayedSpinner', {
        data: () => { return { display: false } },
        props: { color: String, size: Number },
        created() { setTimeout(() => { this.display = true }, 200) },
        render(h) {
            if (!this.display) {
                return h()
            }
            const spinner = h(QSpinnerIos, { props: this.$props })
            return h('transition', {
                props: {
                    name: 'q-transition--fade',
                    appear: true
                }
            }, [spinner])
        }
    })

    Object.defineProperties(Vue.prototype, {
        $state: {
            get() { return state }
        },
        $storage: {
            get() { return storage }
        },
        $authenticate: {
            get(): Vue['$authenticate'] {
                const vm = this as Vue
                return (task, options) => {
                    return new Promise((resolve, reject) => {
                        options = options || {}
                        vm.$q.dialog({
                            component: AuthenticationDialog,
                            parent: vm,
                            task,
                            title: options.title
                        })
                            .onOk(resolve)
                            .onCancel(() => reject(new Error('cancelled')))
                    })
                }
            }
        },
        $loading: {
            get(): Vue['$loading'] {
                const root = (this as Vue).$root
                return async (task) => {
                    try {
                        if (loadingCount++ === 0) {
                            // set 0 delay to block mouse/touch event
                            root.$q.loading.show({
                                spinner: delayedSpinner as unknown as Vue,
                                delay: 0,
                                backgroundColor: 'transparent',
                                spinnerColor: 'black'
                            })
                        }
                        return await task()
                    } finally {
                        if (--loadingCount === 0) {
                            root.$q.loading.hide()
                        }
                    }
                }
            }
        },
        $stackedRoute: {
            get(): Entry | null {
                let vm = this as Vue
                const stack = vm.$stack.full
                do {
                    const path = vm.$attrs['stacked-full-path']
                    if (path) {
                        return stack.find(e => e.fullPath === path) || null
                    }
                    vm = vm.$parent
                } while (vm)
                return null
            }
        }
    })

    Vue.use(AsyncComputed)
})
