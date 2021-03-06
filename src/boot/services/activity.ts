import { Storage } from 'core/storage'
import { delegateTable } from './utils'

export function build(storage: Storage) {
    const t = delegateTable<Storage.ActivityEntity, M.Activity>(
        storage.activities,
        e => ({
            id: e.id,
            gid: e.gid,
            type: e.type,
            walletId: e.walletId,
            createdTime: e.createdTime,
            status: e.status,
            glob: JSON.parse(e.glob)
        }),
        m => ({
            id: m.id,
            gid: m.gid,
            type: m.type,
            walletId: m.walletId,
            createdTime: m.createdTime,
            status: m.status,
            glob: m.glob && JSON.stringify(m.glob)
        })
    )
    return {
        uncompleted() {
            return t.all().except({ status: 'completed' }).query()
        },
        page(count: number, offset: number) {
            return t.all().reverse().limit(count, offset).query()
        },
        add(a: M.Activity<'id?'>) {
            return t.insert(a)
        },
        // only tx activity is allowed to be updated
        update(id: number, values: { status?: M.Activity['status'], glob?: M.Activity.TxGlob }) {
            return t.update({ id }, values)
        }
    }
}
